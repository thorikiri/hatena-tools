import type {
  HatenaBlockNode,
  HatenaDocument,
  HatenaHeadingLevel,
  HatenaInlineNode,
  HatenaListBlock,
  HatenaPhotoInfo,
  ParseHatenaOptions,
} from '../ast/types.js';
import { parseHatena } from '../parser/parse-hatena.js';
import type { HeadingConvertOptions } from '../units/heading.js';
import { escapeHtml, sanitizeUrl } from '../utils/html.js';

export interface HatenaHtmlRenderers {
  heading?: (
    node: Extract<HatenaBlockNode, { type: 'heading' }>,
    childrenHtml: string,
    adjustedLevel: HatenaHeadingLevel,
  ) => string | undefined;
  codeBlock?: (
    node: Extract<HatenaBlockNode, { type: 'codeBlock' }>,
  ) => string | undefined;
  blockquote?: (
    node: Extract<HatenaBlockNode, { type: 'blockquote' }>,
    childrenHtml: string,
  ) => string | undefined;
  link?: (
    node: Extract<HatenaInlineNode, { type: 'link' }>,
  ) => string | undefined;
  photo?: (node: { type: 'photo' } & HatenaPhotoInfo) => string | undefined;
  embed?: (
    node: Extract<HatenaInlineNode, { type: 'embed' }>,
  ) => string | undefined;
  toc?: (document: HatenaDocument) => string | undefined;
  more?: (
    node: Extract<HatenaBlockNode, { type: 'more' }>,
  ) => string | undefined;
}

export interface HatenaToHtmlOptions {
  /** parseHatena へ渡すオプション */
  parseOptions?: ParseHatenaOptions;
  /** 見出しレベルのオフセット・クランプ設定 */
  headingOptions?: HeadingConvertOptions;
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
  /** 要素ごとのカスタムレンダラーフック（undefined を返すとデフォルト出力を使用） */
  renderers?: HatenaHtmlRenderers;
}

function adjustHeadingLevel(
  level: HatenaHeadingLevel,
  options?: HeadingConvertOptions,
): HatenaHeadingLevel {
  const min = options?.minLevel ?? 1;
  const max = options?.maxLevel ?? 6;
  const offset = options?.levelOffset ?? 0;
  return Math.min(max, Math.max(min, level + offset)) as HatenaHeadingLevel;
}

function inlineToPlainText(nodes: HatenaInlineNode[]): string {
  return nodes
    .map((node) => {
      switch (node.type) {
        case 'text':
        case 'code':
          return node.value;
        case 'bold':
        case 'italic':
        case 'strike':
          return inlineToPlainText(node.children);
        case 'link':
          return node.title || node.url;
        case 'photo':
          return node.syntax;
        case 'embed':
          return `${node.provider}:${node.id}`;
        case 'tex':
          return node.value;
        case 'footnote':
          return '';
        default:
          return '';
      }
    })
    .join('');
}

function renderInlineNodes(
  nodes: HatenaInlineNode[],
  options: HatenaToHtmlOptions,
): string {
  return nodes.map((node) => renderInlineNode(node, options)).join('');
}

function renderInlineNode(
  node: HatenaInlineNode,
  options: HatenaToHtmlOptions,
): string {
  switch (node.type) {
    case 'text':
      return escapeHtml(node.value);
    case 'bold':
      return `<strong>${renderInlineNodes(node.children, options)}</strong>`;
    case 'italic':
      return `<em>${renderInlineNodes(node.children, options)}</em>`;
    case 'strike':
      return `<del>${renderInlineNodes(node.children, options)}</del>`;
    case 'code':
      return `<code>${escapeHtml(node.value)}</code>`;
    case 'link': {
      const custom = options.renderers?.link?.(node);
      if (custom !== undefined) return custom;

      const safeUrl = sanitizeUrl(node.url);
      if (!safeUrl) {
        return escapeHtml(node.title || node.url);
      }

      if (node.mode === 'embed' && options.renderEmbedCards !== false) {
        const embedSrc = `https://hatenablog-parts.com/embed?url=${encodeURIComponent(safeUrl)}`;
        return `<iframe src="${escapeHtml(embedSrc)}" class="embed-card embed-blogcard" title="${escapeHtml(node.title || safeUrl)}" loading="lazy"></iframe>`;
      }

      if (node.mode === 'bookmark') {
        const bookmarkUrl = `https://b.hatena.ne.jp/entry/${safeUrl.replace(/^https?:\/\//i, '')}`;
        return `<a href="${escapeHtml(bookmarkUrl)}" class="hatena-bookmark-link">${escapeHtml(node.title || safeUrl)}</a>`;
      }

      const label = node.title || safeUrl;
      return `<a href="${escapeHtml(safeUrl)}">${escapeHtml(label)}</a>`;
    }
    case 'photo': {
      const custom = options.renderers?.photo?.(node);
      if (custom !== undefined) return custom;

      const attrs = [
        `src="${escapeHtml(node.imageUrl)}"`,
        `alt="${escapeHtml(node.alt ?? node.syntax)}"`,
        ...(node.title ? [`title="${escapeHtml(node.title)}"`] : []),
        ...(options.photoClassName
          ? [`class="${escapeHtml(options.photoClassName)}"`]
          : []),
        ...(options.photoLoading ? [`loading="${options.photoLoading}"`] : []),
      ];
      return `<img ${attrs.join(' ')} />`;
    }
    case 'embed': {
      const custom = options.renderers?.embed?.(node);
      if (custom !== undefined) return custom;

      if (node.provider === 'youtube') {
        const src = `https://www.youtube.com/embed/${encodeURIComponent(node.id)}`;
        return `<iframe src="${escapeHtml(src)}" class="embed-youtube" title="YouTube video ${escapeHtml(node.id)}" loading="lazy" allowfullscreen></iframe>`;
      }
      if (node.provider === 'twitter') {
        const tweetUrl = `https://twitter.com/i/status/${encodeURIComponent(node.id)}`;
        return `<blockquote class="twitter-tweet"><a href="${escapeHtml(tweetUrl)}">${escapeHtml(tweetUrl)}</a></blockquote>`;
      }
      const amazonUrl = `https://www.amazon.co.jp/dp/${encodeURIComponent(node.id)}`;
      return `<a href="${escapeHtml(amazonUrl)}" class="hatena-asin-link">ASIN: ${escapeHtml(node.id)}</a>`;
    }
    case 'tex':
      return `<span class="hatena-tex" data-tex="${escapeHtml(node.value)}">\\(${escapeHtml(node.value)}\\)</span>`;
    case 'footnote':
      return `<sup id="fnref-${node.id}"><a href="#fn-${node.id}" class="footnote-ref">*${node.id}</a></sup>`;
  }
}

function renderListBlock(
  list: HatenaListBlock,
  options: HatenaToHtmlOptions,
): string {
  const tag = list.ordered ? 'ol' : 'ul';
  const itemsHtml = list.items
    .map((item) => {
      const inlineHtml = renderInlineNodes(item.children, options);
      const subHtml = item.subLists
        .map((sub) => `\n${renderListBlock(sub, options)}`)
        .join('');
      return `<li>${inlineHtml}${subHtml}</li>`;
    })
    .join('\n');
  return `<${tag}>\n${itemsHtml}\n</${tag}>`;
}

function renderToc(
  document: HatenaDocument,
  options: HatenaToHtmlOptions,
): string {
  const custom = options.renderers?.toc?.(document);
  if (custom !== undefined) return custom;

  if (options.generateToc === false) {
    return '<nav class="hatena-toc" data-toc></nav>';
  }

  const headings = document.blocks.filter(
    (b): b is Extract<HatenaBlockNode, { type: 'heading' }> =>
      b.type === 'heading',
  );
  if (headings.length === 0) {
    return '<nav class="hatena-toc" data-toc></nav>';
  }

  const items = headings
    .map((h, idx) => {
      const level = adjustHeadingLevel(h.level, options.headingOptions);
      const text = inlineToPlainText(h.children);
      return `<li class="toc-level-${level}"><a href="#heading-${idx + 1}">${escapeHtml(text)}</a></li>`;
    })
    .join('\n');

  return `<nav class="hatena-toc" data-toc>\n<ul>\n${items}\n</ul>\n</nav>`;
}

interface RenderState {
  headingIndex: number;
}

function renderBlock(
  block: HatenaBlockNode,
  document: HatenaDocument,
  options: HatenaToHtmlOptions,
  state: RenderState,
): string {
  switch (block.type) {
    case 'heading': {
      state.headingIndex += 1;
      const level = adjustHeadingLevel(block.level, options.headingOptions);
      const childrenHtml = renderInlineNodes(block.children, options);
      const custom = options.renderers?.heading?.(block, childrenHtml, level);
      if (custom !== undefined) return custom;
      return `<h${level} id="heading-${state.headingIndex}">${childrenHtml}</h${level}>`;
    }
    case 'paragraph': {
      const content = renderInlineNodes(block.children, options).replace(
        /\n/g,
        '<br />\n',
      );
      return `<p>${content}</p>`;
    }
    case 'list':
      return renderListBlock(block, options);
    case 'definitionList': {
      const items = block.items
        .map(
          (item) =>
            `<dt>${renderInlineNodes(item.term, options)}</dt>\n<dd>${renderInlineNodes(item.description, options)}</dd>`,
        )
        .join('\n');
      return `<dl>\n${items}\n</dl>`;
    }
    case 'table': {
      if (block.rows.length === 0) return '<table></table>';
      const firstRow = block.rows[0] ?? [];
      const hasHeaderRow =
        firstRow.length > 0 && firstRow.every((cell) => cell.header);
      const renderRow = (row: typeof firstRow) =>
        `<tr>${row
          .map((cell) => {
            const tag = cell.header ? 'th' : 'td';
            return `<${tag}>${renderInlineNodes(cell.children, options)}</${tag}>`;
          })
          .join('')}</tr>`;

      if (hasHeaderRow) {
        const thead = `<thead>\n${renderRow(firstRow)}\n</thead>`;
        const bodyRows = block.rows.slice(1).map(renderRow).join('\n');
        const tbody = bodyRows ? `\n<tbody>\n${bodyRows}\n</tbody>` : '';
        return `<table>\n${thead}${tbody}\n</table>`;
      }
      const tbody = `<tbody>\n${block.rows.map(renderRow).join('\n')}\n</tbody>`;
      return `<table>\n${tbody}\n</table>`;
    }
    case 'blockquote': {
      const childrenHtml = block.children
        .map((child) => renderBlock(child, document, options, state))
        .join('\n');
      const custom = options.renderers?.blockquote?.(block, childrenHtml);
      if (custom !== undefined) return custom;

      const safeCite = block.citeUrl ? sanitizeUrl(block.citeUrl) : null;
      const citeAttr = safeCite ? ` cite="${escapeHtml(safeCite)}"` : '';
      const footer = safeCite
        ? `\n<footer>出典: <a href="${escapeHtml(safeCite)}">${escapeHtml(block.citeTitle || safeCite)}</a></footer>`
        : '';
      return `<blockquote${citeAttr}>\n${childrenHtml}${footer}\n</blockquote>`;
    }
    case 'codeBlock': {
      const custom = options.renderers?.codeBlock?.(block);
      if (custom !== undefined) return custom;
      const classAttr = block.lang
        ? ` class="language-${escapeHtml(block.lang)}"`
        : '';
      return `<pre><code${classAttr}>${escapeHtml(block.code)}</code></pre>`;
    }
    case 'pre':
      return `<pre>${renderInlineNodes(block.children, options)}</pre>`;
    case 'toc':
      return renderToc(document, options);
    case 'more': {
      const custom = options.renderers?.more?.(block);
      if (custom !== undefined) return custom;
      return block.label
        ? `<!--more:${escapeHtml(block.label)}-->`
        : '<!--more-->';
    }
    case 'hr':
      return '<hr />';
    case 'comment':
      return '';
  }
}

/**
 * はてな記法テキスト全体をセマンティックな HTML へ変換する
 */
export function hatenaToHtml(
  hatenaText: string,
  options: HatenaToHtmlOptions = {},
): string {
  if (!hatenaText) return '';

  const document = parseHatena(hatenaText, options.parseOptions);
  const state: RenderState = { headingIndex: 0 };

  const blocksHtml = document.blocks
    .map((block) => renderBlock(block, document, options, state))
    .filter(Boolean)
    .join('\n');

  if (options.renderFootnotes === false || document.footnotes.length === 0) {
    return blocksHtml;
  }

  const footnoteItems = document.footnotes
    .map((fn) => {
      const content = renderInlineNodes(fn.children, options);
      return `<li id="fn-${fn.id}">${content} <a href="#fnref-${fn.id}" class="footnote-backref">↩</a></li>`;
    })
    .join('\n');

  const footnotesSection = `<section class="footnotes">\n<ol>\n${footnoteItems}\n</ol>\n</section>`;
  return blocksHtml ? `${blocksHtml}\n${footnotesSection}` : footnotesSection;
}
