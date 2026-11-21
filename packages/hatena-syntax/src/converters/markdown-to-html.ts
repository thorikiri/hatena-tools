import type {
  HatenaBlockNode,
  HatenaHeadingLevel,
  HatenaInlineNode,
} from '../ast/types.js';
import { parseHatenaPhotoSyntax } from '../parser/photo-syntax.js';
import type { HeadingConvertOptions } from '../units/heading.js';
import { escapeHtml, sanitizeUrl } from '../utils/html.js';
import type { HatenaHtmlRenderers } from './hatena-to-html.js';

export interface MarkdownToHtmlOptions {
  /** 見出しレベルのオフセット・クランプ設定 */
  headingOptions?: HeadingConvertOptions;
  /** Markdown 内に混在するはてな独自記法（[f:id:...], [:contents], [URL:embed] 等）を展開するか（デフォルト: true） */
  enableHatenaSyntax?: boolean;
  /** 目次（[:contents]）から見出しリストを自動生成するか（デフォルト: true） */
  generateToc?: boolean;
  /** 脚注リスト（<section class="footnotes">）を末尾に出力するか（デフォルト: true） */
  renderFootnotes?: boolean;
  /** ブログカード（[URL:embed]）を iframe として出力するか（デフォルト: true） */
  renderEmbedCards?: boolean;
  /** フォトライフ画像に付与する loading 属性 */
  photoLoading?: 'lazy' | 'eager';
  /** フォトライフ画像に付与する class 属性 */
  photoClassName?: string;
  /** 要素ごとのカスタムレンダラーフック */
  renderers?: HatenaHtmlRenderers;
}

interface MarkdownRenderContext {
  options: MarkdownToHtmlOptions;
  namedFootnotes: Map<string, string>;
  footnotes: Array<{ id: number; html: string }>;
  nextFootnoteId: number;
  headings: Array<{ level: HatenaHeadingLevel; id: string; text: string }>;
}

function adjustHeadingLevel(
  level: number,
  options?: HeadingConvertOptions,
): HatenaHeadingLevel {
  const min = options?.minLevel ?? 1;
  const max = options?.maxLevel ?? 6;
  const offset = options?.levelOffset ?? 0;
  return Math.min(max, Math.max(min, level + offset)) as HatenaHeadingLevel;
}

function registerFootnote(html: string, ctx: MarkdownRenderContext): number {
  const id = ctx.nextFootnoteId;
  ctx.nextFootnoteId += 1;
  ctx.footnotes.push({ id, html });
  return id;
}

function renderInlineMarkdown(
  text: string,
  ctx: MarkdownRenderContext,
): string {
  const tokens: string[] = [];
  const stash = (html: string): string => {
    const idx = tokens.length;
    tokens.push(html);
    return `%%MD_HTML_${idx}%%`;
  };

  let result = text;

  // 1. インラインコードを最優先で保護
  result = result.replace(/(`+)([\s\S]*?)\1/g, (_m, _fence, code: string) =>
    stash(`<code>${escapeHtml(code)}</code>`),
  );

  // 2. はてな独自記法（有効時）
  if (ctx.options.enableHatenaSyntax !== false) {
    // 脚注 ((...))
    result = result.replace(/\(\(([^)\n]+)\)\)/g, (_m, inner: string) => {
      const fnHtml = renderInlineMarkdown(inner, ctx);
      const id = registerFootnote(fnHtml, ctx);
      return stash(
        `<sup id="fnref-${id}"><a href="#fn-${id}" class="footnote-ref">*${id}</a></sup>`,
      );
    });

    // 角括弧記法（[f:id:...], [youtube:...], [twitter:...], [asin:...], [https://...]）
    // ただし直後に (url) が続く Markdown リンク [label](url) は除外
    result = result.replace(
      /\[(f:id:[^\]\n]+|youtube:[a-zA-Z0-9_-]+|twitter:\d+|asin:[a-zA-Z0-9]{10}(?::(?:detail|image|title))?|https?:\/\/[^\]\s]+?(?::(?:title(?:=[^\]\n]+)?|bookmark|embed))?)\](?!\()/g,
      (fullMatch, inner: string) => {
        if (inner.startsWith('f:id:')) {
          const photo = parseHatenaPhotoSyntax(inner);
          if (photo) {
            const photoNode = { type: 'photo' as const, ...photo };
            const custom = ctx.options.renderers?.photo?.(photoNode);
            if (custom !== undefined) return stash(custom);

            const attrs = [
              `src="${escapeHtml(photo.imageUrl)}"`,
              `alt="${escapeHtml(photo.syntax)}"`,
              ...(ctx.options.photoClassName
                ? [`class="${escapeHtml(ctx.options.photoClassName)}"`]
                : []),
              ...(ctx.options.photoLoading
                ? [`loading="${ctx.options.photoLoading}"`]
                : []),
            ];
            return stash(`<img ${attrs.join(' ')} />`);
          }
        }

        const ytMatch = /^youtube:([a-zA-Z0-9_-]+)$/.exec(inner);
        if (ytMatch?.[1]) {
          const embedNode: Extract<HatenaInlineNode, { type: 'embed' }> = {
            type: 'embed',
            provider: 'youtube',
            id: ytMatch[1],
          };
          const custom = ctx.options.renderers?.embed?.(embedNode);
          if (custom !== undefined) return stash(custom);
          const src = `https://www.youtube.com/embed/${encodeURIComponent(ytMatch[1])}`;
          return stash(
            `<iframe src="${escapeHtml(src)}" class="embed-youtube" title="YouTube video ${escapeHtml(ytMatch[1])}" loading="lazy" allowfullscreen></iframe>`,
          );
        }

        const twMatch = /^twitter:(\d+)$/.exec(inner);
        if (twMatch?.[1]) {
          const embedNode: Extract<HatenaInlineNode, { type: 'embed' }> = {
            type: 'embed',
            provider: 'twitter',
            id: twMatch[1],
          };
          const custom = ctx.options.renderers?.embed?.(embedNode);
          if (custom !== undefined) return stash(custom);
          const tweetUrl = `https://twitter.com/i/status/${encodeURIComponent(twMatch[1])}`;
          return stash(
            `<blockquote class="twitter-tweet"><a href="${escapeHtml(tweetUrl)}">${escapeHtml(tweetUrl)}</a></blockquote>`,
          );
        }

        const asinMatch =
          /^asin:([a-zA-Z0-9]{10})(?::(detail|image|title))?$/.exec(inner);
        if (asinMatch?.[1]) {
          const embedNode: Extract<HatenaInlineNode, { type: 'embed' }> = {
            type: 'embed',
            provider: 'asin',
            id: asinMatch[1],
            option: asinMatch[2],
          };
          const custom = ctx.options.renderers?.embed?.(embedNode);
          if (custom !== undefined) return stash(custom);
          const amazonUrl = `https://www.amazon.co.jp/dp/${encodeURIComponent(asinMatch[1])}`;
          return stash(
            `<a href="${escapeHtml(amazonUrl)}" class="hatena-asin-link">ASIN: ${escapeHtml(asinMatch[1])}</a>`,
          );
        }

        const linkMatch =
          /^(https?:\/\/[^\s\]]+?)(?::(title(?:=([^\]]+))?|bookmark|embed))?$/.exec(
            inner,
          );
        if (linkMatch?.[1]) {
          const url = linkMatch[1];
          const suffix = linkMatch[2];
          const title = linkMatch[3];
          const mode =
            suffix === 'embed'
              ? 'embed'
              : suffix === 'bookmark'
                ? 'bookmark'
                : title
                  ? 'title'
                  : 'plain';

          const linkNode: Extract<HatenaInlineNode, { type: 'link' }> = {
            type: 'link',
            url,
            title,
            mode,
          };
          const custom = ctx.options.renderers?.link?.(linkNode);
          if (custom !== undefined) return stash(custom);

          const safeUrl = sanitizeUrl(url);
          if (!safeUrl) return fullMatch;

          if (mode === 'embed' && ctx.options.renderEmbedCards !== false) {
            const embedSrc = `https://hatenablog-parts.com/embed?url=${encodeURIComponent(safeUrl)}`;
            return stash(
              `<iframe src="${escapeHtml(embedSrc)}" class="embed-card embed-blogcard" title="${escapeHtml(title || safeUrl)}" loading="lazy"></iframe>`,
            );
          }
          if (mode === 'bookmark') {
            const bookmarkUrl = `https://b.hatena.ne.jp/entry/${safeUrl.replace(/^https?:\/\//i, '')}`;
            return stash(
              `<a href="${escapeHtml(bookmarkUrl)}" class="hatena-bookmark-link">${escapeHtml(title || safeUrl)}</a>`,
            );
          }
          return stash(
            `<a href="${escapeHtml(safeUrl)}">${escapeHtml(title || safeUrl)}</a>`,
          );
        }

        return fullMatch;
      },
    );
  }

  // 3. Markdown 画像 ![alt](url)
  result = result.replace(
    /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g,
    (_m, alt: string, url: string, titleAttr?: string) => {
      const safeUrl = sanitizeUrl(url);
      if (!safeUrl) return escapeHtml(alt);
      const attrs = [
        `src="${escapeHtml(safeUrl)}"`,
        `alt="${escapeHtml(alt)}"`,
        ...(titleAttr ? [`title="${escapeHtml(titleAttr)}"`] : []),
        ...(ctx.options.photoLoading
          ? [`loading="${ctx.options.photoLoading}"`]
          : []),
      ];
      return stash(`<img ${attrs.join(' ')} />`);
    },
  );

  // 4. Markdown 脚注参照 [^id]
  result = result.replace(
    /\[\^([a-zA-Z0-9_-]+)\]/g,
    (fullMatch, refId: string) => {
      const def = ctx.namedFootnotes.get(refId);
      if (def === undefined) return fullMatch;
      const fnHtml = renderInlineMarkdown(def, ctx);
      const id = registerFootnote(fnHtml, ctx);
      return stash(
        `<sup id="fnref-${id}"><a href="#fn-${id}" class="footnote-ref">*${id}</a></sup>`,
      );
    },
  );

  // 5. Markdown リンク [label](url)
  result = result.replace(
    /\[([^\]]+)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g,
    (_m, label: string, url: string, titleAttr?: string) => {
      const safeUrl = sanitizeUrl(url);
      const innerHtml = renderInlineMarkdown(label, ctx);
      if (!safeUrl) return stash(innerHtml);
      const titlePart = titleAttr ? ` title="${escapeHtml(titleAttr)}"` : '';
      return stash(
        `<a href="${escapeHtml(safeUrl)}"${titlePart}>${innerHtml}</a>`,
      );
    },
  );

  // 6. 裸の URL オートリンク
  result = result.replace(/https?:\/\/[^\s<>()[\]]+/g, (url) => {
    const safeUrl = sanitizeUrl(url);
    if (!safeUrl) return url;
    return stash(`<a href="${escapeHtml(safeUrl)}">${escapeHtml(safeUrl)}</a>`);
  });

  // 7. 装飾（打ち消し線・太字・斜体）
  result = result.replace(/~~([^~]+)~~/g, (_m, inner: string) =>
    stash(`<del>${renderInlineMarkdown(inner, ctx)}</del>`),
  );
  result = result.replace(/\*\*([^*]+)\*\*/g, (_m, inner: string) =>
    stash(`<strong>${renderInlineMarkdown(inner, ctx)}</strong>`),
  );
  result = result.replace(/__([^_]+)__/g, (_m, inner: string) =>
    stash(`<strong>${renderInlineMarkdown(inner, ctx)}</strong>`),
  );
  result = result.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, (_m, inner: string) =>
    stash(`<em>${renderInlineMarkdown(inner, ctx)}</em>`),
  );
  result = result.replace(
    /(?<![a-zA-Z0-9_])_([^_]+)_(?![a-zA-Z0-9_])/g,
    (_m, inner: string) =>
      stash(`<em>${renderInlineMarkdown(inner, ctx)}</em>`),
  );

  // 8. 残りの生テキストをすべて XSS エスケープしてからプレースホルダーを復元
  const escaped = escapeHtml(result);
  return escaped.replace(/%%MD_HTML_(\d+)%%/g, (_m, idxStr: string) => {
    return tokens[Number.parseInt(idxStr, 10)] ?? '';
  });
}

interface ParsedListItem {
  depth: number;
  ordered: boolean;
  content: string;
}

function renderListItems(
  items: ParsedListItem[],
  ctx: MarkdownRenderContext,
): string {
  const buildLevel = (
    startIndex: number,
    baseDepth: number,
    ordered: boolean,
  ): { html: string; nextIndex: number } => {
    const tag = ordered ? 'ol' : 'ul';
    const liParts: string[] = [];
    let i = startIndex;

    while (i < items.length) {
      const current = items[i];
      if (!current || current.depth < baseDepth) break;
      if (current.depth === baseDepth && current.ordered !== ordered) break;

      if (current.depth > baseDepth) {
        const sub = buildLevel(i, current.depth, current.ordered);
        const lastIdx = liParts.length - 1;
        if (lastIdx >= 0) {
          liParts[lastIdx] =
            liParts[lastIdx]?.replace(/<\/li>$/, `\n${sub.html}</li>`) ?? '';
        } else {
          liParts.push(`<li>${sub.html}</li>`);
        }
        i = sub.nextIndex;
        continue;
      }

      liParts.push(`<li>${renderInlineMarkdown(current.content, ctx)}</li>`);
      i += 1;
    }

    return {
      html: `<${tag}>\n${liParts.join('\n')}\n</${tag}>`,
      nextIndex: i,
    };
  };

  const parts: string[] = [];
  let idx = 0;
  while (idx < items.length) {
    const first = items[idx];
    if (!first) break;
    const built = buildLevel(idx, first.depth, first.ordered);
    parts.push(built.html);
    idx = built.nextIndex;
  }
  return parts.join('\n');
}

function isTableSeparator(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.includes('|')) return false;
  const cells = trimmed.replace(/^\|/, '').replace(/\|$/, '').split('|');
  return (
    cells.length > 0 && cells.every((cell) => /^\s*:?-{3,}:?\s*$/.test(cell))
  );
}

function splitTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

/**
 * Markdown テキスト全体（はてな記法の混在に対応）をセマンティックな HTML へ変換する
 */
export function markdownToHtml(
  markdownText: string,
  options: MarkdownToHtmlOptions = {},
): string {
  if (!markdownText) return '';

  const rawLines = markdownText.replace(/\r\n/g, '\n').split('\n');
  const namedFootnotes = new Map<string, string>();
  const lines: string[] = [];

  for (const line of rawLines) {
    const fnMatch = /^\[\^([a-zA-Z0-9_-]+)\]:\s*(.+)$/.exec(line);
    if (fnMatch?.[1] && fnMatch[2] !== undefined) {
      namedFootnotes.set(fnMatch[1], fnMatch[2].trim());
      continue;
    }
    lines.push(line);
  }

  const ctx: MarkdownRenderContext = {
    options,
    namedFootnotes,
    footnotes: [],
    nextFootnoteId: 1,
    headings: [],
  };

  const TOC_PLACEHOLDER = '%%HATENA_MD_TOC_PLACEHOLDER%%';
  const blocks: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? '';
    const trimmed = line.trim();

    if (trimmed === '') {
      i += 1;
      continue;
    }

    // 1. フェンスコードブロック
    const fenceMatch = /^(`{3,}|~{3,})(.*)$/.exec(trimmed);
    if (fenceMatch?.[1]) {
      const fenceChar = fenceMatch[1][0] ?? '`';
      const fenceLen = fenceMatch[1].length;
      const lang = (fenceMatch[2] ?? '').trim();
      const codeLines: string[] = [];
      i += 1;
      while (i < lines.length) {
        const current = lines[i] ?? '';
        if (
          new RegExp(`^${fenceChar}{${fenceLen},}\\s*$`).test(current.trim())
        ) {
          i += 1;
          break;
        }
        codeLines.push(current);
        i += 1;
      }
      const code = codeLines.join('\n');
      const codeNode: Extract<HatenaBlockNode, { type: 'codeBlock' }> = {
        type: 'codeBlock',
        lang,
        code,
      };
      const custom = options.renderers?.codeBlock?.(codeNode);
      if (custom !== undefined) {
        blocks.push(custom);
      } else {
        const classAttr = lang ? ` class="language-${escapeHtml(lang)}"` : '';
        blocks.push(`<pre><code${classAttr}>${escapeHtml(code)}</code></pre>`);
      }
      continue;
    }

    // 2. [:contents] (はてな独自目次)
    if (options.enableHatenaSyntax !== false && trimmed === '[:contents]') {
      blocks.push(TOC_PLACEHOLDER);
      i += 1;
      continue;
    }

    // 3. <!--more-->
    const moreMatch = /^<!--\s*more(?::([^\s-]+))?\s*-->$/i.exec(trimmed);
    if (moreMatch) {
      const label = moreMatch[1];
      const moreNode: Extract<HatenaBlockNode, { type: 'more' }> = {
        type: 'more',
        label,
      };
      const custom = options.renderers?.more?.(moreNode);
      blocks.push(
        custom !== undefined
          ? custom
          : label
            ? `<!--more:${escapeHtml(label)}-->`
            : '<!--more-->',
      );
      i += 1;
      continue;
    }

    // 4. 水平線
    if (/^(?:---+|\*\*\*+|___+)\s*$/.test(trimmed)) {
      blocks.push('<hr />');
      i += 1;
      continue;
    }

    // 5. 見出し
    const headingMatch = /^(#{1,6})\s+(.+?)\s*#*$/.exec(trimmed);
    if (headingMatch?.[1] && headingMatch[2]) {
      const level = adjustHeadingLevel(
        headingMatch[1].length,
        options.headingOptions,
      );
      const id = `heading-${ctx.headings.length + 1}`;
      const rawText = headingMatch[2].trim();
      ctx.headings.push({ level, id, text: rawText });
      const childrenHtml = renderInlineMarkdown(rawText, ctx);
      const headingNode: Extract<HatenaBlockNode, { type: 'heading' }> = {
        type: 'heading',
        level,
        children: [],
      };
      const custom = options.renderers?.heading?.(
        headingNode,
        childrenHtml,
        level,
      );
      blocks.push(
        custom !== undefined
          ? custom
          : `<h${level} id="${id}">${childrenHtml}</h${level}>`,
      );
      i += 1;
      continue;
    }

    // 6. GFM テーブル
    if (
      line.includes('|') &&
      i + 1 < lines.length &&
      isTableSeparator(lines[i + 1] ?? '')
    ) {
      const headers = splitTableRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && (lines[i] ?? '').includes('|')) {
        const rowLine = lines[i] ?? '';
        if (rowLine.trim() === '') break;
        rows.push(splitTableRow(rowLine));
        i += 1;
      }
      const thead = `<thead>\n<tr>${headers.map((h) => `<th>${renderInlineMarkdown(h, ctx)}</th>`).join('')}</tr>\n</thead>`;
      const tbodyRows = rows
        .map(
          (row) =>
            `<tr>${row.map((cell) => `<td>${renderInlineMarkdown(cell, ctx)}</td>`).join('')}</tr>`,
        )
        .join('\n');
      const tbody = tbodyRows ? `\n<tbody>\n${tbodyRows}\n</tbody>` : '';
      blocks.push(`<table>\n${thead}${tbody}\n</table>`);
      continue;
    }

    // 7. 引用ブロック
    if (/^>\s?/.test(line)) {
      const quoteLines: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i] ?? '')) {
        quoteLines.push((lines[i] ?? '').replace(/^>\s?/, ''));
        i += 1;
      }
      const innerHtml = markdownToHtml(quoteLines.join('\n'), {
        ...options,
        renderFootnotes: false,
      });
      blocks.push(`<blockquote>\n${innerHtml}\n</blockquote>`);
      continue;
    }

    // 8. リスト
    if (/^(\s*)(?:([-*+])|(\d+)\.)\s+(.+)$/.test(line)) {
      const items: ParsedListItem[] = [];
      while (i < lines.length) {
        const current = lines[i] ?? '';
        const itemMatch = /^(\s*)(?:([-*+])|(\d+)\.)\s+(.+)$/.exec(current);
        if (!itemMatch) break;
        const indentSpaces = (itemMatch[1] ?? '').replace(/\t/g, '  ').length;
        items.push({
          depth: Math.floor(indentSpaces / 2),
          ordered: Boolean(itemMatch[3]),
          content: (itemMatch[4] ?? '').trim(),
        });
        i += 1;
      }
      blocks.push(renderListItems(items, ctx));
      continue;
    }

    // 9. 段落（連続する通常行をまとめる）
    const paraLines: string[] = [];
    while (i < lines.length) {
      const current = lines[i] ?? '';
      const curTrim = current.trim();
      if (
        curTrim === '' ||
        /^(`{3,}|~{3,})/.test(curTrim) ||
        /^(#{1,6})\s+/.test(curTrim) ||
        /^>\s?/.test(current) ||
        /^(\s*)(?:([-*+])|(\d+)\.)\s+/.test(current) ||
        /^(?:---+|\*\*\*+|___+)\s*$/.test(curTrim) ||
        (options.enableHatenaSyntax !== false && curTrim === '[:contents]') ||
        /^<!--\s*more/i.test(curTrim)
      ) {
        break;
      }
      paraLines.push(current);
      i += 1;
    }
    if (paraLines.length > 0) {
      blocks.push(
        `<p>${paraLines.map((l) => renderInlineMarkdown(l, ctx)).join('<br />\n')}</p>`,
      );
    }
  }

  let html = blocks.join('\n');

  // TOC 置換
  if (html.includes(TOC_PLACEHOLDER)) {
    let tocHtml = '<nav class="hatena-toc" data-toc></nav>';
    if (options.generateToc !== false && ctx.headings.length > 0) {
      const items = ctx.headings
        .map(
          (h) =>
            `<li class="toc-level-${h.level}"><a href="#${h.id}">${escapeHtml(h.text)}</a></li>`,
        )
        .join('\n');
      tocHtml = `<nav class="hatena-toc" data-toc>\n<ul>\n${items}\n</ul>\n</nav>`;
    }
    html = html.replaceAll(TOC_PLACEHOLDER, tocHtml);
  }

  if (options.renderFootnotes === false || ctx.footnotes.length === 0) {
    return html;
  }

  const footnoteItems = ctx.footnotes
    .map(
      (fn) =>
        `<li id="fn-${fn.id}">${fn.html} <a href="#fnref-${fn.id}" class="footnote-backref">↩</a></li>`,
    )
    .join('\n');

  const footnotesSection = `<section class="footnotes">\n<ol>\n${footnoteItems}\n</ol>\n</section>`;
  return html ? `${html}\n${footnotesSection}` : footnotesSection;
}
