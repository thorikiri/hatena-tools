import type { HatenaHeadingLevel } from '../ast/types.js';
import type { HeadingConvertOptions } from '../units/heading.js';
import { htmlImgToHatenaPhoto } from '../units/photo.js';
import { unescapeHtml } from '../utils/html.js';

export interface HtmlToHatenaOptions {
  /** 見出しレベルのオフセット・クランプ設定 */
  headingOptions?: HeadingConvertOptions;
}

type HtmlNode =
  | { type: 'text'; value: string }
  | { type: 'comment'; value: string }
  | {
      type: 'element';
      tag: string;
      attrs: Record<string, string>;
      children: HtmlNode[];
    };

const VOID_TAGS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

function parseAttributes(attrString: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrRegex =
    /([a-zA-Z0-9_:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match: RegExpExecArray | null = attrRegex.exec(attrString);
  while (match !== null) {
    const name = match[1]?.toLowerCase();
    if (name) {
      const rawValue = match[2] ?? match[3] ?? match[4] ?? '';
      attrs[name] = unescapeHtml(rawValue);
    }
    match = attrRegex.exec(attrString);
  }
  return attrs;
}

function parseHtmlTree(html: string): HtmlNode[] {
  const rootChildren: HtmlNode[] = [];
  const stack: Array<{ tag: string; children: HtmlNode[] }> = [
    { tag: '#root', children: rootChildren },
  ];

  const tokenRegex =
    /<!--([\s\S]*?)-->|<\/([a-zA-Z0-9-]+)\s*>|<([a-zA-Z0-9-]+)((?:\s+[^<>]*?)?)\s*(\/?)>/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null = tokenRegex.exec(html);

  const pushText = (text: string) => {
    if (!text) return;
    const top = stack[stack.length - 1];
    if (top) {
      top.children.push({ type: 'text', value: text });
    }
  };

  while (match !== null) {
    if (match.index > lastIndex) {
      pushText(html.slice(lastIndex, match.index));
    }

    if (match[1] !== undefined) {
      const top = stack[stack.length - 1];
      if (top) {
        top.children.push({ type: 'comment', value: match[1] });
      }
    } else if (match[2] !== undefined) {
      const closeTag = match[2].toLowerCase();
      for (let i = stack.length - 1; i >= 1; i -= 1) {
        if (stack[i]?.tag === closeTag) {
          stack.length = i;
          break;
        }
      }
    } else if (match[3] !== undefined) {
      const tag = match[3].toLowerCase();
      const attrs = parseAttributes(match[4] ?? '');
      const selfClosing = match[5] === '/' || VOID_TAGS.has(tag);
      const element: Extract<HtmlNode, { type: 'element' }> = {
        type: 'element',
        tag,
        attrs,
        children: [],
      };
      const top = stack[stack.length - 1];
      if (top) {
        top.children.push(element);
      }
      if (!selfClosing) {
        stack.push({ tag, children: element.children });
      }
    }

    lastIndex = tokenRegex.lastIndex;
    match = tokenRegex.exec(html);
  }

  if (lastIndex < html.length) {
    pushText(html.slice(lastIndex));
  }

  return rootChildren;
}

function getRawText(nodes: HtmlNode[]): string {
  return nodes
    .map((node) => {
      if (node.type === 'text') return unescapeHtml(node.value);
      if (node.type === 'comment') return '';
      if (node.tag === 'br') return '\n';
      return getRawText(node.children);
    })
    .join('');
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

function serializeImgElement(attrs: Record<string, string>): string {
  const src = attrs.src ?? '';
  const alt = attrs.alt ?? '';
  const reconstructed = `<img src="${src}" alt="${alt}" />`;
  const hatenaPhoto = htmlImgToHatenaPhoto(reconstructed);
  if (hatenaPhoto) return hatenaPhoto;
  return alt ? `<img src="${src}" alt="${alt}" />` : `<img src="${src}" />`;
}

function serializeIframeElement(attrs: Record<string, string>): string {
  const src = attrs.src ?? '';
  const blogcardMatch = /hatenablog-parts\.com\/embed\?url=([^&]+)/i.exec(src);
  if (blogcardMatch?.[1]) {
    const decoded = decodeURIComponent(blogcardMatch[1]);
    return `[${decoded}:embed]`;
  }
  const youtubeMatch = /youtube\.com\/embed\/([a-zA-Z0-9_-]+)/i.exec(src);
  if (youtubeMatch?.[1]) {
    return `[youtube:${youtubeMatch[1]}]`;
  }
  return '';
}

function convertInlineNodes(
  nodes: HtmlNode[],
  footnotes: Map<string, string>,
): string {
  return nodes
    .map((node) => {
      if (node.type === 'text') {
        return unescapeHtml(node.value);
      }
      if (node.type === 'comment') {
        const moreMatch = /^\s*more(?::([^\s-]+))?\s*$/i.exec(node.value);
        if (moreMatch) {
          return moreMatch[1] ? `====[${moreMatch[1]}]` : '====';
        }
        return '';
      }

      switch (node.tag) {
        case 'br':
          return '\n';
        case 'img':
          return serializeImgElement(node.attrs);
        case 'iframe':
          return serializeIframeElement(node.attrs);
        case 'code':
          return `\`${getRawText(node.children)}\``;
        case 'strong':
        case 'b':
          return `<strong>${convertInlineNodes(node.children, footnotes)}</strong>`;
        case 'em':
        case 'i':
          return `<em>${convertInlineNodes(node.children, footnotes)}</em>`;
        case 'del':
        case 's':
          return `<del>${convertInlineNodes(node.children, footnotes)}</del>`;
        case 'sup': {
          const idAttr = node.attrs.id ?? '';
          const fnRefMatch = /^fnref-(\d+)$/.exec(idAttr);
          if (fnRefMatch?.[1]) {
            const def = footnotes.get(fnRefMatch[1]);
            if (def !== undefined) {
              return `((${def}))`;
            }
          }
          return convertInlineNodes(node.children, footnotes);
        }
        case 'a': {
          const href = node.attrs.href ?? '';
          if (!href) return convertInlineNodes(node.children, footnotes);

          const label = convertInlineNodes(node.children, footnotes).trim();
          const className = node.attrs.class ?? '';
          if (
            className.includes('hatena-bookmark-link') &&
            href.startsWith('https://b.hatena.ne.jp/entry/')
          ) {
            const target = `https://${href.replace(/^https:\/\/b\.hatena\.ne\.jp\/entry\//, '')}`;
            return `[${target}:bookmark]`;
          }
          if (!label || label === href) {
            return `[${href}]`;
          }
          return `[${href}:title=${label}]`;
        }
        default:
          return convertInlineNodes(node.children, footnotes);
      }
    })
    .join('');
}

function convertListElement(
  listEl: Extract<HtmlNode, { type: 'element' }>,
  depth: number,
  footnotes: Map<string, string>,
): string[] {
  const marker = listEl.tag === 'ol' ? '+' : '-';
  const prefix = marker.repeat(depth);
  const lines: string[] = [];

  for (const child of listEl.children) {
    if (child.type !== 'element' || child.tag !== 'li') continue;

    const inlineParts: HtmlNode[] = [];
    const nestedLists: Array<Extract<HtmlNode, { type: 'element' }>> = [];
    for (const liChild of child.children) {
      if (
        liChild.type === 'element' &&
        (liChild.tag === 'ul' || liChild.tag === 'ol')
      ) {
        nestedLists.push(liChild);
      } else {
        inlineParts.push(liChild);
      }
    }

    const text = convertInlineNodes(inlineParts, footnotes).trim();
    if (text) {
      lines.push(`${prefix} ${text}`);
    }
    for (const nested of nestedLists) {
      lines.push(...convertListElement(nested, depth + 1, footnotes));
    }
  }

  return lines;
}

function extractFootnotes(nodes: HtmlNode[], footnotes: Map<string, string>) {
  for (const node of nodes) {
    if (node.type !== 'element') continue;
    if (
      node.tag === 'section' &&
      (node.attrs.class ?? '').includes('footnotes')
    ) {
      const collectLi = (children: HtmlNode[]) => {
        for (const child of children) {
          if (child.type !== 'element') continue;
          if (child.tag === 'li') {
            const idMatch = /^fn-(\d+)$/.exec(child.attrs.id ?? '');
            if (idMatch?.[1]) {
              const filtered = child.children.filter(
                (c) =>
                  !(
                    c.type === 'element' &&
                    c.tag === 'a' &&
                    (c.attrs.class ?? '').includes('footnote-backref')
                  ),
              );
              const text = convertInlineNodes(filtered, footnotes).trim();
              footnotes.set(idMatch[1], text);
            }
          } else {
            collectLi(child.children);
          }
        }
      };
      collectLi(node.children);
      continue;
    }
    extractFootnotes(node.children, footnotes);
  }
}

function convertBlocks(
  nodes: HtmlNode[],
  options: HtmlToHatenaOptions,
  footnotes: Map<string, string>,
): string[] {
  const blocks: string[] = [];

  for (const node of nodes) {
    if (node.type === 'text') {
      const trimmed = unescapeHtml(node.value).trim();
      if (trimmed) blocks.push(trimmed);
      continue;
    }

    if (node.type === 'comment') {
      const moreMatch = /^\s*more(?::([^\s-]+))?\s*$/i.exec(node.value);
      if (moreMatch) {
        blocks.push(moreMatch[1] ? `====[${moreMatch[1]}]` : '====');
      }
      continue;
    }

    // 脚注セクションは本文には出力しない
    if (
      node.tag === 'section' &&
      (node.attrs.class ?? '').includes('footnotes')
    ) {
      continue;
    }

    // Tiptap 等の目次カード・続きを読むカード
    if ('data-toc-card' in node.attrs || 'data-toc' in node.attrs) {
      blocks.push('[:contents]');
      continue;
    }
    if ('data-more-divider' in node.attrs) {
      blocks.push('====');
      continue;
    }

    // 見出し <h1>〜<h6>
    const headingMatch = /^h([1-6])$/.exec(node.tag);
    if (headingMatch?.[1]) {
      const rawLevel = Number.parseInt(headingMatch[1], 10);
      const level = adjustHeadingLevel(rawLevel, options.headingOptions);
      const text = convertInlineNodes(node.children, footnotes).trim();
      if (text) {
        blocks.push(`${'*'.repeat(level)} ${text}`);
      }
      continue;
    }

    // 水平線 <hr>
    if (node.tag === 'hr') {
      blocks.push('----');
      continue;
    }

    // コードブロック <pre><code>...</code></pre>
    if (node.tag === 'pre') {
      const codeChild = node.children.find(
        (c): c is Extract<HtmlNode, { type: 'element' }> =>
          c.type === 'element' && c.tag === 'code',
      );
      const classAttr = codeChild?.attrs.class ?? node.attrs.class ?? '';
      const langMatch = /language-([a-zA-Z0-9_+-]+)/.exec(classAttr);
      const lang = langMatch?.[1] ?? '';
      const rawCode = getRawText(
        codeChild ? codeChild.children : node.children,
      );
      const code = rawCode.replace(/^\n|\n$/g, '');
      blocks.push(`>|${lang}|\n${code}\n||<`);
      continue;
    }

    // 引用 <blockquote>
    if (node.tag === 'blockquote') {
      const citeUrl = node.attrs.cite;
      let citeTitle = '';
      const bodyChildren: HtmlNode[] = [];

      for (const child of node.children) {
        if (child.type === 'element' && child.tag === 'footer') {
          const anchor = child.children.find(
            (c): c is Extract<HtmlNode, { type: 'element' }> =>
              c.type === 'element' && c.tag === 'a',
          );
          if (anchor) {
            citeTitle = getRawText(anchor.children).trim();
          }
          continue;
        }
        bodyChildren.push(child);
      }

      const innerBlocks = convertBlocks(bodyChildren, options, footnotes);
      const openTag = citeUrl
        ? citeTitle && citeTitle !== citeUrl
          ? `>${citeUrl}:title=${citeTitle}>`
          : `>${citeUrl}>`
        : '>>';
      blocks.push(`${openTag}\n${innerBlocks.join('\n')}\n<<`);
      continue;
    }

    // リスト <ul> / <ol>
    if (node.tag === 'ul' || node.tag === 'ol') {
      const listLines = convertListElement(node, 1, footnotes);
      if (listLines.length > 0) {
        blocks.push(listLines.join('\n'));
      }
      continue;
    }

    // 定義リスト <dl>
    if (node.tag === 'dl') {
      const dlLines: string[] = [];
      let currentTerm = '';
      for (const child of node.children) {
        if (child.type !== 'element') continue;
        if (child.tag === 'dt') {
          currentTerm = convertInlineNodes(child.children, footnotes).trim();
        } else if (child.tag === 'dd') {
          const desc = convertInlineNodes(child.children, footnotes).trim();
          if (currentTerm) {
            dlLines.push(`:${currentTerm}:${desc}`);
          }
        }
      }
      if (dlLines.length > 0) {
        blocks.push(dlLines.join('\n'));
      }
      continue;
    }

    // 段落 <p>
    if (node.tag === 'p') {
      const text = convertInlineNodes(node.children, footnotes).trim();
      if (text) {
        blocks.push(text);
      }
      continue;
    }

    // 単体の img / iframe
    if (node.tag === 'img') {
      const img = serializeImgElement(node.attrs);
      if (img) blocks.push(img);
      continue;
    }
    if (node.tag === 'iframe') {
      const iframe = serializeIframeElement(node.attrs);
      if (iframe) blocks.push(iframe);
      continue;
    }

    // div / article / section などのコンテナは子要素を再帰変換
    blocks.push(...convertBlocks(node.children, options, footnotes));
  }

  return blocks;
}

/**
 * HTML テキスト全体（Tiptap 等のリッチエディタ出力を含む）をはてな記法へ変換する
 */
export function htmlToHatena(
  htmlText: string,
  options: HtmlToHatenaOptions = {},
): string {
  if (!htmlText) return '';

  const tree = parseHtmlTree(htmlText);
  const footnotes = new Map<string, string>();
  extractFootnotes(tree, footnotes);

  const blocks = convertBlocks(tree, options, footnotes);
  return blocks.join('\n\n').trim();
}
