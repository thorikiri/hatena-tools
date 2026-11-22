import type {
  HatenaBlockNode,
  HatenaDefinitionItem,
  HatenaDocument,
  HatenaFootnoteDefinition,
  HatenaHeadingLevel,
  HatenaInlineNode,
  HatenaListBlock,
  HatenaListItem,
  HatenaTableCell,
  ParseHatenaOptions,
} from '../ast/types.js';
import { parseHatenaPhotoSyntax } from './photo-syntax.js';

interface ParseContext {
  autoLink: boolean;
  footnotes: HatenaFootnoteDefinition[];
  nextFootnoteId: number;
}

const HEADING_REGEX = /^(\*{1,6})\s+(.+)$/;
const HEADING_NO_SPACE_REGEX = /^(\*{1,6})([^\s*].*)$/;
const SUPER_PRE_START_REGEX = /^>\|([a-zA-Z0-9_+-]*)\|$/;
const SUPER_PRE_END_REGEX = /^\|\|<$/;
const QUOTE_START_REGEX =
  /^>(?:(https?:\/\/[^\s:>]+)(?::title=([^>\r\n]+))?)?>$/;
const QUOTE_END_REGEX = /^<<$/;
const LIST_REGEX = /^([-+]+)\s+(.+)$/;
const DEFINITION_REGEX = /^:([^:\n]+):(.*)$/;
const TABLE_ROW_REGEX = /^\|(.+)\|$/;
const TOC_REGEX = /^\[:contents\]$/;
const MORE_REGEX = /^====(?:\[([^\]]+)\])?$/;
const HR_REGEX = /^-{4,}$/;

/**
 * インライン記法をパースする
 */
export function parseInline(
  text: string,
  ctx: ParseContext,
): HatenaInlineNode[] {
  const nodes: HatenaInlineNode[] = [];
  let index = 0;

  const pushText = (value: string) => {
    if (!value) return;
    const last = nodes[nodes.length - 1];
    if (last && last.type === 'text') {
      last.value += value;
    } else {
      nodes.push({ type: 'text', value });
    }
  };

  while (index < text.length) {
    const rest = text.slice(index);

    // 1. 脚注: ((...))
    if (rest.startsWith('((')) {
      const endIdx = rest.indexOf('))', 2);
      if (endIdx !== -1) {
        const inner = rest.slice(2, endIdx);
        const id = ctx.nextFootnoteId;
        ctx.nextFootnoteId += 1;
        const children = parseInline(inner, ctx);
        ctx.footnotes.push({ id, children });
        nodes.push({ type: 'footnote', id, children });
        index += endIdx + 2;
        continue;
      }
    }

    // 2. インラインコード: `...`
    if (rest.startsWith('`')) {
      const endIdx = rest.indexOf('`', 1);
      if (endIdx !== -1) {
        nodes.push({ type: 'code', value: rest.slice(1, endIdx) });
        index += endIdx + 1;
        continue;
      }
    }

    // 3. 太字: **...**
    if (rest.startsWith('**')) {
      const endIdx = rest.indexOf('**', 2);
      if (endIdx !== -1 && endIdx > 2) {
        const inner = rest.slice(2, endIdx);
        nodes.push({ type: 'bold', children: parseInline(inner, ctx) });
        index += endIdx + 2;
        continue;
      }
    }

    // 4. 打ち消し線: ~~...~~
    if (rest.startsWith('~~')) {
      const endIdx = rest.indexOf('~~', 2);
      if (endIdx !== -1 && endIdx > 2) {
        const inner = rest.slice(2, endIdx);
        nodes.push({ type: 'strike', children: parseInline(inner, ctx) });
        index += endIdx + 2;
        continue;
      }
    }

    // 5. 角括弧記法: [f:id:...], [youtube:...], [twitter:...], [asin:...], [https://...]
    if (rest.startsWith('[')) {
      const closeIdx = rest.indexOf(']');
      if (closeIdx !== -1) {
        const bracketInner = rest.slice(1, closeIdx);

        // フォトライフ記法
        if (bracketInner.startsWith('f:id:')) {
          const photo = parseHatenaPhotoSyntax(bracketInner);
          if (photo) {
            nodes.push({ type: 'photo', ...photo });
            index += closeIdx + 1;
            continue;
          }
        }

        // YouTube 埋め込み
        const ytMatch = /^youtube:([a-zA-Z0-9_-]+)$/.exec(bracketInner);
        if (ytMatch?.[1]) {
          nodes.push({
            type: 'embed',
            provider: 'youtube',
            id: ytMatch[1],
          });
          index += closeIdx + 1;
          continue;
        }

        // Twitter 埋め込み
        const twMatch = /^twitter:(\d+)$/.exec(bracketInner);
        if (twMatch?.[1]) {
          nodes.push({
            type: 'embed',
            provider: 'twitter',
            id: twMatch[1],
          });
          index += closeIdx + 1;
          continue;
        }

        // Amazon ASIN 埋め込み
        const asinMatch =
          /^asin:([a-zA-Z0-9]{10})(?::(detail|image|title))?$/.exec(
            bracketInner,
          );
        if (asinMatch?.[1]) {
          nodes.push({
            type: 'embed',
            provider: 'asin',
            id: asinMatch[1],
            ...(asinMatch[2] ? { option: asinMatch[2] } : {}),
          });
          index += closeIdx + 1;
          continue;
        }

        // URL リンク記法: [https://...:title=...], [https://...:embed], [https://...:bookmark], [https://...]
        const urlMatch =
          /^(https?:\/\/[^\s\]]+?)(?::(title(?:=([^\]]+))?|bookmark|embed))?$/.exec(
            bracketInner,
          );
        if (urlMatch?.[1]) {
          const url = urlMatch[1];
          const suffix = urlMatch[2];
          const customTitle = urlMatch[3];
          let mode: 'plain' | 'title' | 'bookmark' | 'embed' = 'plain';
          if (suffix === 'bookmark') mode = 'bookmark';
          else if (suffix === 'embed') mode = 'embed';
          else if (suffix?.startsWith('title')) mode = 'title';

          nodes.push({
            type: 'link',
            url,
            ...(customTitle ? { title: customTitle } : {}),
            mode,
          });
          index += closeIdx + 1;
          continue;
        }
      }
    }

    // 6. 裸の URL（autoLink 有効時）
    if (
      ctx.autoLink &&
      (rest.startsWith('https://') || rest.startsWith('http://'))
    ) {
      const bareUrlMatch = /^(https?:\/\/[^\s<>\]]+)/.exec(rest);
      if (bareUrlMatch?.[1]) {
        nodes.push({
          type: 'link',
          url: bareUrlMatch[1],
          mode: 'plain',
        });
        index += bareUrlMatch[1].length;
        continue;
      }
    }

    // 通常の1文字を進む（次の特殊トークン開始文字までまとめて進める）
    const nextSpecial = rest.slice(1).search(/[([`*~h]/);
    if (nextSpecial === -1) {
      pushText(rest);
      break;
    }
    pushText(rest.slice(0, nextSpecial + 1));
    index += nextSpecial + 1;
  }

  return nodes;
}

function parseListBlock(
  lines: string[],
  startIndex: number,
  ctx: ParseContext,
): { node: HatenaListBlock; nextIndex: number } {
  const firstMatch = LIST_REGEX.exec(lines[startIndex] ?? '');
  const rootOrdered = firstMatch?.[1]?.startsWith('+') ?? false;
  const rootBlock: HatenaListBlock = {
    type: 'list',
    ordered: rootOrdered,
    items: [],
  };

  let idx = startIndex;
  while (idx < lines.length) {
    const line = lines[idx] ?? '';
    const match = LIST_REGEX.exec(line);
    if (!match?.[1] || !match[2]) break;

    const marker = match[1];
    const ordered = marker.startsWith('+');
    const depth = marker.length;

    if (depth === 1 && ordered !== rootOrdered) {
      break;
    }

    const item: HatenaListItem = {
      children: parseInline(match[2], ctx),
      subLists: [],
    };

    if (depth === 1) {
      rootBlock.items.push(item);
    } else {
      // ネストリストを直前のアイテムにぶら下げる
      let parentItems = rootBlock.items;
      for (let d = 2; d < depth; d++) {
        const lastParent = parentItems[parentItems.length - 1];
        if (!lastParent) break;
        const lastSub = lastParent.subLists[lastParent.subLists.length - 1];
        if (!lastSub) break;
        parentItems = lastSub.items;
      }

      const targetParent = parentItems[parentItems.length - 1];
      if (targetParent) {
        const existingSub =
          targetParent.subLists[targetParent.subLists.length - 1];
        if (existingSub && existingSub.ordered === ordered) {
          existingSub.items.push(item);
        } else {
          targetParent.subLists.push({
            type: 'list',
            ordered,
            items: [item],
          });
        }
      } else {
        rootBlock.items.push(item);
      }
    }

    idx += 1;
  }

  return { node: rootBlock, nextIndex: idx };
}

function hasLeadingWhitespace(line: string): boolean {
  return /^[ \t]/.test(line);
}

function isBlockBoundary(line: string): boolean {
  if (line.trim() === '') return true;
  if (hasLeadingWhitespace(line)) return false;
  const trimmed = line.trimEnd();
  return (
    HEADING_REGEX.test(trimmed) ||
    HEADING_NO_SPACE_REGEX.test(trimmed) ||
    SUPER_PRE_START_REGEX.test(trimmed) ||
    QUOTE_START_REGEX.test(trimmed) ||
    LIST_REGEX.test(trimmed) ||
    DEFINITION_REGEX.test(trimmed) ||
    TABLE_ROW_REGEX.test(trimmed) ||
    TOC_REGEX.test(trimmed) ||
    MORE_REGEX.test(trimmed) ||
    HR_REGEX.test(trimmed)
  );
}

function parseBlocks(lines: string[], ctx: ParseContext): HatenaBlockNode[] {
  const blocks: HatenaBlockNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? '';
    if (line.trim() === '') {
      i += 1;
      continue;
    }

    if (hasLeadingWhitespace(line)) {
      const paraLines: string[] = [];
      while (i < lines.length && !isBlockBoundary(lines[i] ?? '')) {
        paraLines.push(lines[i] ?? '');
        i += 1;
      }
      if (paraLines.length > 0) {
        blocks.push({
          type: 'paragraph',
          children: parseInline(paraLines.join('\n'), ctx),
        });
      }
      continue;
    }

    const trimmed = line.trimEnd();

    // 1. スーパー pre 記法: >|lang| ... ||<
    const superPreMatch = SUPER_PRE_START_REGEX.exec(trimmed);
    if (superPreMatch) {
      const lang = superPreMatch[1]?.trim() ?? '';
      const codeLines: string[] = [];
      i += 1;
      while (
        i < lines.length &&
        !SUPER_PRE_END_REGEX.test((lines[i] ?? '').trim())
      ) {
        codeLines.push(lines[i] ?? '');
        i += 1;
      }
      if (i < lines.length) i += 1; // ||< をスキップ
      blocks.push({
        type: 'codeBlock',
        lang,
        code: codeLines.join('\n'),
      });
      continue;
    }

    // 2. 引用記法: >> ... << / >URL> ... <<
    const quoteMatch = QUOTE_START_REGEX.exec(trimmed);
    if (quoteMatch) {
      const citeUrl = quoteMatch[1];
      const citeTitle = quoteMatch[2]?.trim();
      const innerLines: string[] = [];
      i += 1;
      while (
        i < lines.length &&
        !QUOTE_END_REGEX.test((lines[i] ?? '').trim())
      ) {
        innerLines.push(lines[i] ?? '');
        i += 1;
      }
      if (i < lines.length) i += 1; // << をスキップ
      blocks.push({
        type: 'blockquote',
        ...(citeUrl ? { citeUrl } : {}),
        ...(citeTitle ? { citeTitle } : {}),
        children: parseBlocks(innerLines, ctx),
      });
      continue;
    }

    // 3. 目次: [:contents]
    if (TOC_REGEX.test(trimmed)) {
      blocks.push({ type: 'toc' });
      i += 1;
      continue;
    }

    // 4. 続きを読む: ==== / ====[label]
    const moreMatch = MORE_REGEX.exec(trimmed);
    if (moreMatch) {
      blocks.push({
        type: 'more',
        ...(moreMatch[1] ? { label: moreMatch[1] } : {}),
      });
      i += 1;
      continue;
    }

    // 5. 水平線: ----
    if (HR_REGEX.test(trimmed)) {
      blocks.push({ type: 'hr' });
      i += 1;
      continue;
    }

    // 6. 見出し: * 〜 ******
    const headingMatch =
      HEADING_REGEX.exec(trimmed) ?? HEADING_NO_SPACE_REGEX.exec(trimmed);
    if (headingMatch?.[1] && headingMatch[2]) {
      const level = headingMatch[1].length as HatenaHeadingLevel;
      blocks.push({
        type: 'heading',
        level,
        children: parseInline(headingMatch[2].trim(), ctx),
      });
      i += 1;
      continue;
    }

    // 7. リスト: -, +
    if (LIST_REGEX.test(trimmed)) {
      const { node, nextIndex } = parseListBlock(lines, i, ctx);
      blocks.push(node);
      i = nextIndex;
      continue;
    }

    // 8. 定義リスト: :term:desc
    if (DEFINITION_REGEX.test(trimmed)) {
      const items: HatenaDefinitionItem[] = [];
      while (i < lines.length) {
        const current = lines[i] ?? '';
        if (hasLeadingWhitespace(current)) break;
        const defMatch = DEFINITION_REGEX.exec(current.trimEnd());
        if (!defMatch?.[1]) break;
        items.push({
          term: parseInline(defMatch[1].trim(), ctx),
          description: parseInline((defMatch[2] ?? '').trim(), ctx),
        });
        i += 1;
      }
      blocks.push({ type: 'definitionList', items });
      continue;
    }

    // 8.5. 表組み記法: |...| / |*...|
    if (TABLE_ROW_REGEX.test(trimmed)) {
      const rows: HatenaTableCell[][] = [];
      while (i < lines.length) {
        const current = lines[i] ?? '';
        if (hasLeadingWhitespace(current)) break;
        const rowMatch = TABLE_ROW_REGEX.exec(current.trimEnd());
        if (!rowMatch?.[1]) break;
        const rawCells = rowMatch[1].split('|');
        const cells: HatenaTableCell[] = rawCells.map((rawCell) => {
          const isHeader = rawCell.startsWith('*');
          const content = (isHeader ? rawCell.slice(1) : rawCell).trim();
          return {
            header: isHeader,
            children: parseInline(content, ctx),
          };
        });
        rows.push(cells);
        i += 1;
      }
      blocks.push({ type: 'table', rows });
      continue;
    }

    // 9. 段落（空行または他のブロック開始まで）
    const paraLines: string[] = [];
    while (i < lines.length && !isBlockBoundary(lines[i] ?? '')) {
      paraLines.push(lines[i] ?? '');
      i += 1;
    }
    if (paraLines.length > 0) {
      blocks.push({
        type: 'paragraph',
        children: parseInline(paraLines.join('\n'), ctx),
      });
    } else {
      i += 1;
    }
  }

  return blocks;
}

/**
 * はてな記法テキストを型付き AST（HatenaDocument）にパースする
 */
export function parseHatena(
  hatenaText: string,
  options?: ParseHatenaOptions,
): HatenaDocument {
  const normalized = hatenaText.replace(/\r\n?/g, '\n');
  const lines = normalized.split('\n');
  const ctx: ParseContext = {
    autoLink: options?.autoLink ?? true,
    footnotes: [],
    nextFootnoteId: 1,
  };

  const blocks = parseBlocks(lines, ctx);

  return {
    type: 'document',
    blocks,
    footnotes: ctx.footnotes,
  };
}
