import type { HatenaHeadingLevel } from '../ast/types.js';
import type { HeadingConvertOptions } from '../units/heading.js';
import { htmlImgToHatenaPhoto } from '../units/photo.js';
import { unescapeHtml } from '../utils/html.js';
import {
  getRawText,
  type HtmlNode,
  parseHtmlTree,
} from '../utils/html-parser.js';

export interface HtmlToMarkdownOptions {
  /** 見出しレベルのオフセット・クランプ設定 */
  headingOptions?: HeadingConvertOptions;
  /** フォトライフ画像を ![alt](url) ではなく [f:id:...] 記法へ復元するか（デフォルト: false） */
  preserveHatenaPhotoSyntax?: boolean;
  /** 目次カードやブログカード等をはてな独自記法（[:contents], [URL:embed]）へ復元するか（デフォルト: true） */
  preserveHatenaEmbedSyntax?: boolean;
  /** 脚注（<section class="footnotes">）を [^n]: ... 形式で出力するか（デフォルト: true） */
  renderFootnotes?: boolean;
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

function getFence(code: string): string {
  const matches = code.match(/`+/g);
  const maxLen = matches ? Math.max(...matches.map((m) => m.length)) : 0;
  return '`'.repeat(Math.max(3, maxLen + 1));
}

function serializeImgElement(
  attrs: Record<string, string>,
  options: HtmlToMarkdownOptions,
): string {
  const src = attrs.src ?? '';
  const alt = attrs.alt ?? '';
  if (options.preserveHatenaPhotoSyntax) {
    const hatenaPhoto = htmlImgToHatenaPhoto(
      `<img src="${src}" alt="${alt}" />`,
    );
    if (hatenaPhoto) return hatenaPhoto;
  }
  return `![${alt}](${src})`;
}

function serializeIframeElement(
  attrs: Record<string, string>,
  options: HtmlToMarkdownOptions,
): string {
  const src = attrs.src ?? '';
  const preserveEmbed = options.preserveHatenaEmbedSyntax !== false;
  const blogcardMatch = /hatenablog-parts\.com\/embed\?url=([^&]+)/i.exec(src);
  if (blogcardMatch?.[1]) {
    const decoded = decodeURIComponent(blogcardMatch[1]);
    return preserveEmbed ? `[${decoded}:embed]` : `[${decoded}](${decoded})`;
  }
  const youtubeMatch = /youtube\.com\/embed\/([a-zA-Z0-9_-]+)/i.exec(src);
  if (youtubeMatch?.[1]) {
    return preserveEmbed
      ? `[youtube:${youtubeMatch[1]}]`
      : `https://www.youtube.com/watch?v=${youtubeMatch[1]}`;
  }
  return '';
}

function convertInlineNodes(
  nodes: HtmlNode[],
  options: HtmlToMarkdownOptions,
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
          return moreMatch[1] ? `<!--more:${moreMatch[1]}-->` : '<!--more-->';
        }
        return '';
      }

      switch (node.tag) {
        case 'br':
          return '\n';
        case 'img':
          return serializeImgElement(node.attrs, options);
        case 'iframe':
          return serializeIframeElement(node.attrs, options);
        case 'code': {
          const code = getRawText(node.children);
          const fence = code.includes('`') ? '``' : '`';
          const padded = code.includes('`') ? ` ${code} ` : code;
          return `${fence}${padded}${fence}`;
        }
        case 'strong':
        case 'b':
          return `**${convertInlineNodes(node.children, options, footnotes)}**`;
        case 'em':
        case 'i':
          return `*${convertInlineNodes(node.children, options, footnotes)}*`;
        case 'del':
        case 's':
          return `~~${convertInlineNodes(node.children, options, footnotes)}~~`;
        case 'sup': {
          const fnRefMatch = /^fnref-(\d+)$/.exec(node.attrs.id ?? '');
          if (fnRefMatch?.[1] && footnotes.has(fnRefMatch[1])) {
            return `[^${fnRefMatch[1]}]`;
          }
          return convertInlineNodes(node.children, options, footnotes);
        }
        case 'a': {
          const href = node.attrs.href ?? '';
          if (!href) {
            return convertInlineNodes(node.children, options, footnotes);
          }
          const label = convertInlineNodes(
            node.children,
            options,
            footnotes,
          ).trim();
          const className = node.attrs.class ?? '';
          if (
            options.preserveHatenaEmbedSyntax !== false &&
            className.includes('hatena-bookmark-link') &&
            href.startsWith('https://b.hatena.ne.jp/entry/')
          ) {
            const target = `https://${href.replace(/^https:\/\/b\.hatena\.ne\.jp\/entry\//, '')}`;
            return `[${target}:bookmark]`;
          }
          if (!label || label === href) {
            return href;
          }
          return `[${label}](${href})`;
        }
        default:
          return convertInlineNodes(node.children, options, footnotes);
      }
    })
    .join('');
}

function convertListElement(
  listEl: Extract<HtmlNode, { type: 'element' }>,
  depth: number,
  options: HtmlToMarkdownOptions,
  footnotes: Map<string, string>,
): string[] {
  const indent = '  '.repeat(depth);
  const lines: string[] = [];
  let itemIndex = 1;

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

    const marker = listEl.tag === 'ol' ? `${itemIndex}.` : '-';
    itemIndex += 1;
    const text = convertInlineNodes(inlineParts, options, footnotes).trim();
    if (text) {
      lines.push(`${indent}${marker} ${text}`);
    }
    for (const nested of nestedLists) {
      lines.push(...convertListElement(nested, depth + 1, options, footnotes));
    }
  }

  return lines;
}

function convertTableElement(
  tableEl: Extract<HtmlNode, { type: 'element' }>,
  options: HtmlToMarkdownOptions,
  footnotes: Map<string, string>,
): string {
  const headerRows: string[][] = [];
  const bodyRows: string[][] = [];

  const collectRows = (nodes: HtmlNode[], inHead: boolean) => {
    for (const node of nodes) {
      if (node.type !== 'element') continue;
      if (node.tag === 'thead') {
        collectRows(node.children, true);
      } else if (node.tag === 'tbody') {
        collectRows(node.children, false);
      } else if (node.tag === 'tr') {
        const cells: string[] = [];
        let hasTh = false;
        for (const cell of node.children) {
          if (
            cell.type === 'element' &&
            (cell.tag === 'th' || cell.tag === 'td')
          ) {
            if (cell.tag === 'th') hasTh = true;
            cells.push(
              convertInlineNodes(cell.children, options, footnotes).trim(),
            );
          }
        }
        if (cells.length > 0) {
          if (inHead || (headerRows.length === 0 && hasTh)) {
            headerRows.push(cells);
          } else {
            bodyRows.push(cells);
          }
        }
      } else {
        collectRows(node.children, inHead);
      }
    }
  };

  collectRows(tableEl.children, false);

  const headers = headerRows[0] ?? bodyRows.shift() ?? [];
  if (headers.length === 0) return '';

  const lines = [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...bodyRows.map((row) => `| ${row.join(' | ')} |`),
  ];
  return lines.join('\n');
}

function extractFootnotes(
  nodes: HtmlNode[],
  options: HtmlToMarkdownOptions,
  footnotes: Map<string, string>,
) {
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
              const text = convertInlineNodes(
                filtered,
                options,
                footnotes,
              ).trim();
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
    extractFootnotes(node.children, options, footnotes);
  }
}

function convertBlocks(
  nodes: HtmlNode[],
  options: HtmlToMarkdownOptions,
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
        blocks.push(
          moreMatch[1] ? `<!--more:${moreMatch[1]}-->` : '<!--more-->',
        );
      }
      continue;
    }

    if (
      node.tag === 'section' &&
      (node.attrs.class ?? '').includes('footnotes')
    ) {
      continue;
    }

    if (
      options.preserveHatenaEmbedSyntax !== false &&
      ('data-toc-card' in node.attrs || 'data-toc' in node.attrs)
    ) {
      blocks.push('[:contents]');
      continue;
    }

    if ('data-more-divider' in node.attrs) {
      blocks.push('<!--more-->');
      continue;
    }

    const headingMatch = /^h([1-6])$/.exec(node.tag);
    if (headingMatch?.[1]) {
      const rawLevel = Number.parseInt(headingMatch[1], 10);
      const level = adjustHeadingLevel(rawLevel, options.headingOptions);
      const text = convertInlineNodes(node.children, options, footnotes).trim();
      if (text) {
        blocks.push(`${'#'.repeat(level)} ${text}`);
      }
      continue;
    }

    if (node.tag === 'hr') {
      blocks.push('---');
      continue;
    }

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
      const fence = getFence(code);
      blocks.push(`${fence}${lang}\n${code}\n${fence}`);
      continue;
    }

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

      const innerMd = convertBlocks(bodyChildren, options, footnotes).join(
        '\n\n',
      );
      const quotedLines = innerMd
        .split('\n')
        .map((line) => (line ? `> ${line}` : '>'));
      if (citeUrl) {
        quotedLines.push('>');
        quotedLines.push(`> 出典: [${citeTitle || citeUrl}](${citeUrl})`);
      }
      blocks.push(quotedLines.join('\n'));
      continue;
    }

    if (node.tag === 'ul' || node.tag === 'ol') {
      const listLines = convertListElement(node, 0, options, footnotes);
      if (listLines.length > 0) {
        blocks.push(listLines.join('\n'));
      }
      continue;
    }

    if (node.tag === 'dl') {
      const dlLines: string[] = [];
      let currentTerm = '';
      for (const child of node.children) {
        if (child.type !== 'element') continue;
        if (child.tag === 'dt') {
          currentTerm = convertInlineNodes(
            child.children,
            options,
            footnotes,
          ).trim();
        } else if (child.tag === 'dd') {
          const desc = convertInlineNodes(
            child.children,
            options,
            footnotes,
          ).trim();
          if (currentTerm) {
            dlLines.push(`${currentTerm}\n: ${desc}`);
          }
        }
      }
      if (dlLines.length > 0) {
        blocks.push(dlLines.join('\n\n'));
      }
      continue;
    }

    if (node.tag === 'table') {
      const tableMd = convertTableElement(node, options, footnotes);
      if (tableMd) blocks.push(tableMd);
      continue;
    }

    if (node.tag === 'p') {
      const text = convertInlineNodes(node.children, options, footnotes).trim();
      if (text) blocks.push(text);
      continue;
    }

    if (node.tag === 'img') {
      const img = serializeImgElement(node.attrs, options);
      if (img) blocks.push(img);
      continue;
    }

    if (node.tag === 'iframe') {
      const iframe = serializeIframeElement(node.attrs, options);
      if (iframe) blocks.push(iframe);
      continue;
    }

    blocks.push(...convertBlocks(node.children, options, footnotes));
  }

  return blocks;
}

/**
 * HTML テキスト全体（Tiptap 等のリッチエディタ出力・はてな由来要素を含む）を GFM 互換 Markdown へ変換する
 */
export function htmlToMarkdown(
  htmlText: string,
  options: HtmlToMarkdownOptions = {},
): string {
  if (!htmlText) return '';

  const tree = parseHtmlTree(htmlText);
  const footnotes = new Map<string, string>();
  extractFootnotes(tree, options, footnotes);

  const blocks = convertBlocks(tree, options, footnotes);
  const bodyMd = blocks.join('\n\n').trim();

  if (options.renderFootnotes === false || footnotes.size === 0) {
    return bodyMd;
  }

  const footnoteLines = Array.from(footnotes.entries()).map(
    ([id, text]) => `[^${id}]: ${text}`,
  );
  return bodyMd
    ? `${bodyMd}\n\n${footnoteLines.join('\n')}`
    : footnoteLines.join('\n');
}
