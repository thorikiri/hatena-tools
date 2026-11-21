import type {
  HatenaBlockNode,
  HatenaHeadingLevel,
  HatenaInlineNode,
  HatenaListBlock,
  ParseHatenaOptions,
} from '../ast/types.js';
import { parseHatena } from '../parser/parse-hatena.js';
import type { HeadingConvertOptions } from '../units/heading.js';

export interface HatenaToMarkdownOptions {
  /** parseHatena へ渡すオプション */
  parseOptions?: ParseHatenaOptions;
  /** 見出しレベルのオフセット・クランプ設定 */
  headingOptions?: HeadingConvertOptions;
  /** 脚注定義（[^id]: ...）を末尾に出力するか（デフォルト: true） */
  renderFootnotes?: boolean;
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

function renderInlineNodes(nodes: HatenaInlineNode[]): string {
  return nodes.map(renderInlineNode).join('');
}

function renderInlineNode(node: HatenaInlineNode): string {
  switch (node.type) {
    case 'text':
      return node.value;
    case 'bold':
      return `**${renderInlineNodes(node.children)}**`;
    case 'italic':
      return `*${renderInlineNodes(node.children)}*`;
    case 'strike':
      return `~~${renderInlineNodes(node.children)}~~`;
    case 'code': {
      const fence = node.value.includes('`') ? '``' : '`';
      const padded = node.value.includes('`') ? ` ${node.value} ` : node.value;
      return `${fence}${padded}${fence}`;
    }
    case 'link':
      if (node.title) {
        return `[${node.title}](${node.url})`;
      }
      return node.url;
    case 'photo':
      return `![${node.syntax}](${node.imageUrl})`;
    case 'embed':
      if (node.provider === 'youtube') {
        return `https://www.youtube.com/watch?v=${node.id}`;
      }
      if (node.provider === 'twitter') {
        return `https://twitter.com/i/status/${node.id}`;
      }
      return `https://www.amazon.co.jp/dp/${node.id}`;
    case 'footnote':
      return `[^${node.id}]`;
  }
}

function renderListBlock(list: HatenaListBlock, depth = 0): string {
  const indent = '  '.repeat(depth);
  return list.items
    .map((item, idx) => {
      const marker = list.ordered ? `${idx + 1}.` : '-';
      const line = `${indent}${marker} ${renderInlineNodes(item.children)}`;
      const sub = item.subLists
        .map((subList) => renderListBlock(subList, depth + 1))
        .join('\n');
      return sub ? `${line}\n${sub}` : line;
    })
    .join('\n');
}

function getFence(code: string): string {
  const matches = code.match(/`+/g);
  const maxLen = matches ? Math.max(...matches.map((m) => m.length)) : 0;
  return '`'.repeat(Math.max(3, maxLen + 1));
}

function renderBlock(
  block: HatenaBlockNode,
  options: HatenaToMarkdownOptions,
): string {
  switch (block.type) {
    case 'heading': {
      const level = adjustHeadingLevel(block.level, options.headingOptions);
      return `${'#'.repeat(level)} ${renderInlineNodes(block.children)}`;
    }
    case 'paragraph':
      return renderInlineNodes(block.children);
    case 'list':
      return renderListBlock(block);
    case 'definitionList':
      return block.items
        .map(
          (item) =>
            `${renderInlineNodes(item.term)}\n: ${renderInlineNodes(item.description)}`,
        )
        .join('\n\n');
    case 'blockquote': {
      const inner = block.children
        .map((child) => renderBlock(child, options))
        .join('\n\n');
      const quotedLines = inner
        .split('\n')
        .map((line) => (line ? `> ${line}` : '>'));
      if (block.citeUrl) {
        quotedLines.push('>');
        quotedLines.push(
          `> 出典: [${block.citeTitle || block.citeUrl}](${block.citeUrl})`,
        );
      }
      return quotedLines.join('\n');
    }
    case 'codeBlock': {
      const fence = getFence(block.code);
      return `${fence}${block.lang}\n${block.code}\n${fence}`;
    }
    case 'toc':
      return '[:contents]';
    case 'more':
      return '<!--more-->';
    case 'hr':
      return '---';
  }
}

/**
 * はてな記法テキスト全体を GFM 互換 Markdown へ変換する
 */
export function hatenaToMarkdown(
  hatenaText: string,
  options: HatenaToMarkdownOptions = {},
): string {
  if (!hatenaText) return '';

  const document = parseHatena(hatenaText, options.parseOptions);
  const blocksMd = document.blocks
    .map((block) => renderBlock(block, options))
    .join('\n\n');

  if (options.renderFootnotes === false || document.footnotes.length === 0) {
    return blocksMd;
  }

  const footnotesMd = document.footnotes
    .map((fn) => `[^${fn.id}]: ${renderInlineNodes(fn.children)}`)
    .join('\n');

  return blocksMd ? `${blocksMd}\n\n${footnotesMd}` : footnotesMd;
}
