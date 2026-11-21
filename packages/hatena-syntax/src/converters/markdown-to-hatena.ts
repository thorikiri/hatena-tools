import type { HatenaHeadingLevel } from '../ast/types.js';
import type { HeadingConvertOptions } from '../units/heading.js';
import {
  formatHatenaPhotoSyntax,
  imageUrlToHatenaPhoto,
} from '../units/photo.js';
import { escapeHtml } from '../utils/html.js';

export interface MarkdownToHatenaOptions {
  /** 見出しレベルのオフセット・クランプ設定 */
  headingOptions?: HeadingConvertOptions;
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

function convertInlineMarkdown(
  text: string,
  footnotes: Map<string, string>,
): string {
  const codePlaceholders: string[] = [];
  let result = text.replace(/(`+)([\s\S]*?)\1/g, (match) => {
    const idx = codePlaceholders.length;
    codePlaceholders.push(match);
    return `%%HATENA_CODE_${idx}%%`;
  });

  // 画像: ![alt](url)
  result = result.replace(
    /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g,
    (_match, alt: string, url: string) => {
      const fromUrl = imageUrlToHatenaPhoto(url);
      if (fromUrl) return fromUrl;

      if (alt.includes('f:id:')) {
        return formatHatenaPhotoSyntax(alt);
      }

      const altAttr = alt ? ` alt="${escapeHtml(alt)}"` : '';
      return `<img src="${escapeHtml(url)}"${altAttr} />`;
    },
  );

  // リンク: [label](url)
  result = result.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)\s]+)(?:\s+"[^"]*")?\)/g,
    (_match, label: string, url: string) => {
      if (label === url) return `[${url}]`;
      return `[${url}:title=${label}]`;
    },
  );

  // 脚注参照: [^id]
  result = result.replace(/\[\^([a-zA-Z0-9_-]+)\]/g, (match, id: string) => {
    const def = footnotes.get(id);
    if (def === undefined) return match;
    return `((${convertInlineMarkdown(def, footnotes)}))`;
  });

  // 打ち消し線: ~~text~~
  result = result.replace(/~~([^~]+)~~/g, '<del>$1</del>');

  // 太字: **text** / __text__
  result = result.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  result = result.replace(/__([^_]+)__/g, '<strong>$1</strong>');

  // 斜体: *text* / _text_
  result = result.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');
  result = result.replace(
    /(?<![a-zA-Z0-9_])_([^_]+)_(?![a-zA-Z0-9_])/g,
    '<em>$1</em>',
  );

  // インラインコード復元
  result = result.replace(
    /%%HATENA_CODE_(\d+)%%/g,
    (_match, idxStr: string) => {
      return codePlaceholders[Number.parseInt(idxStr, 10)] ?? '';
    },
  );

  return result;
}

/**
 * Markdown テキスト全体をはてな記法へ変換する
 */
export function markdownToHatena(
  markdownText: string,
  options: MarkdownToHatenaOptions = {},
): string {
  if (!markdownText) return '';

  const rawLines = markdownText.replace(/\r\n/g, '\n').split('\n');

  // 脚注定義を事前収集し、定義行は出力から除外
  const footnotes = new Map<string, string>();
  const lines: string[] = [];
  for (const line of rawLines) {
    const fnMatch = /^\[\^([a-zA-Z0-9_-]+)\]:\s*(.+)$/.exec(line);
    if (fnMatch?.[1] && fnMatch[2] !== undefined) {
      footnotes.set(fnMatch[1], fnMatch[2].trim());
      continue;
    }
    lines.push(line);
  }

  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? '';

    // 1. フェンスコードブロック (``` または ~~~)
    const fenceMatch = /^(`{3,}|~{3,})(.*)$/.exec(line.trim());
    if (fenceMatch?.[1]) {
      const fenceChar = fenceMatch[1][0] ?? '`';
      const fenceLen = fenceMatch[1].length;
      const lang = (fenceMatch[2] ?? '').trim();
      const codeLines: string[] = [];
      i += 1;
      while (i < lines.length) {
        const current = lines[i] ?? '';
        const closeMatch = new RegExp(`^${fenceChar}{${fenceLen},}\\s*$`).exec(
          current.trim(),
        );
        if (closeMatch) {
          i += 1;
          break;
        }
        codeLines.push(current);
        i += 1;
      }
      out.push(`>|${lang}|\n${codeLines.join('\n')}\n||<`);
      continue;
    }

    // 2. 空行
    if (line.trim() === '') {
      out.push('');
      i += 1;
      continue;
    }

    // 3. <!--more-->
    if (/^<!--\s*more(?::([^\s-]+))?\s*-->$/i.test(line.trim())) {
      const moreMatch = /^<!--\s*more(?::([^\s-]+))?\s*-->$/i.exec(line.trim());
      out.push(moreMatch?.[1] ? `====[${moreMatch[1]}]` : '====');
      i += 1;
      continue;
    }

    // 4. 水平線
    if (/^(?:---+|\*\*\*+|___+)\s*$/.test(line.trim())) {
      out.push('----');
      i += 1;
      continue;
    }

    // 5. 見出し (# 〜 ######)
    const headingMatch = /^(#{1,6})\s+(.+?)\s*#*$/.exec(line.trim());
    if (headingMatch?.[1] && headingMatch[2]) {
      const level = adjustHeadingLevel(
        headingMatch[1].length,
        options.headingOptions,
      );
      const text = convertInlineMarkdown(headingMatch[2].trim(), footnotes);
      out.push(`${'*'.repeat(level)} ${text}`);
      i += 1;
      continue;
    }

    // 6. 引用ブロック (> ...)
    if (/^>\s?/.test(line)) {
      const quoteLines: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i] ?? '')) {
        const inner = (lines[i] ?? '').replace(/^>\s?/, '');
        quoteLines.push(convertInlineMarkdown(inner, footnotes));
        i += 1;
      }
      out.push(`>>\n${quoteLines.join('\n')}\n<<`);
      continue;
    }

    // 7. リスト（箇条書き / 番号付き）
    const listMatch = /^(\s*)(?:([-*+])|(\d+)\.)\s+(.+)$/.exec(line);
    if (listMatch) {
      while (i < lines.length) {
        const current = lines[i] ?? '';
        const itemMatch = /^(\s*)(?:([-*+])|(\d+)\.)\s+(.+)$/.exec(current);
        if (!itemMatch) break;
        const indentSpaces = (itemMatch[1] ?? '').replace(/\t/g, '  ').length;
        const depth = Math.floor(indentSpaces / 2) + 1;
        const marker = itemMatch[3] ? '+' : '-';
        const content = convertInlineMarkdown(
          (itemMatch[4] ?? '').trim(),
          footnotes,
        );
        out.push(`${marker.repeat(depth)} ${content}`);
        i += 1;
      }
      continue;
    }

    // 8. 通常の行（段落）
    out.push(convertInlineMarkdown(line, footnotes));
    i += 1;
  }

  return out
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
