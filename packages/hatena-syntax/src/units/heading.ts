import type { HatenaHeadingLevel } from '../ast/types.js';
import { escapeHtml, stripHtmlTags } from '../utils/html.js';

export interface HeadingConvertOptions {
  /** 見出しレベルのオフセット（例: はてな * を h3 にする場合は 2、h3 を * に戻す場合は -2） */
  levelOffset?: number;
  /** 出力レベルの最小値（デフォルト: 1） */
  minLevel?: HatenaHeadingLevel;
  /** 出力レベルの最大値（デフォルト: 6） */
  maxLevel?: HatenaHeadingLevel;
}

function clampLevel(
  rawLevel: number,
  options?: HeadingConvertOptions,
): HatenaHeadingLevel {
  const min = options?.minLevel ?? 1;
  const max = options?.maxLevel ?? 6;
  const offset = options?.levelOffset ?? 0;
  const shifted = rawLevel + offset;
  return Math.min(max, Math.max(min, shifted)) as HatenaHeadingLevel;
}

function parseHatenaHeadingLine(
  line: string,
): { level: number; text: string } | null {
  const match = /^\s*(\*{1,6})\s*([^\s*].*|.*)$/.exec(line.trim());
  if (!match?.[1]) return null;
  const text = (match[2] ?? '').trim();
  if (!text) return null;
  return { level: match[1].length, text };
}

function parseHtmlHeading(
  html: string,
): { level: number; text: string } | null {
  const match = /^\s*<h([1-6])(?:\s+[^>]*)?>([\s\S]*?)<\/h\1>\s*$/i.exec(
    html.trim(),
  );
  if (!match?.[1]) return null;
  return {
    level: Number.parseInt(match[1], 10),
    text: stripHtmlTags(match[2] ?? '').trim(),
  };
}

function parseMarkdownHeading(
  md: string,
): { level: number; text: string } | null {
  const match = /^\s*(#{1,6})\s+(.+?)\s*#*$/.exec(md.trim());
  if (!match?.[1] || !match[2]) return null;
  return {
    level: match[1].length,
    text: match[2].trim(),
  };
}

/**
 * はてな記法の見出し行（* 〜 ******）を HTML <h1>〜<h6> へ変換する
 */
export function hatenaHeadingToHtml(
  line: string,
  options?: HeadingConvertOptions,
): string {
  const parsed = parseHatenaHeadingLine(line);
  if (!parsed) return line;
  const level = clampLevel(parsed.level, options);
  return `<h${level}>${escapeHtml(parsed.text)}</h${level}>`;
}

/**
 * はてな記法の見出し行を Markdown 見出し（# 〜 ######）へ変換する
 */
export function hatenaHeadingToMarkdown(
  line: string,
  options?: HeadingConvertOptions,
): string {
  const parsed = parseHatenaHeadingLine(line);
  if (!parsed) return line;
  const level = clampLevel(parsed.level, options);
  return `${'#'.repeat(level)} ${parsed.text}`;
}

/**
 * HTML 見出し（<h1>〜<h6>）を Markdown 見出しへ変換する
 */
export function htmlHeadingToMarkdown(
  html: string,
  options?: HeadingConvertOptions,
): string {
  const parsed = parseHtmlHeading(html);
  if (!parsed) return html;
  const level = clampLevel(parsed.level, options);
  return `${'#'.repeat(level)} ${parsed.text}`;
}

/**
 * HTML 見出し（<h1>〜<h6>）をはてな記法見出しへ変換する
 */
export function htmlHeadingToHatena(
  html: string,
  options?: HeadingConvertOptions,
): string {
  const parsed = parseHtmlHeading(html);
  if (!parsed) return html;
  const level = clampLevel(parsed.level, options);
  return `${'*'.repeat(level)} ${parsed.text}`;
}

/**
 * Markdown 見出し（# 〜 ######）を HTML 見出しへ変換する
 */
export function markdownHeadingToHtml(
  md: string,
  options?: HeadingConvertOptions,
): string {
  const parsed = parseMarkdownHeading(md);
  if (!parsed) return md;
  const level = clampLevel(parsed.level, options);
  return `<h${level}>${escapeHtml(parsed.text)}</h${level}>`;
}

/**
 * Markdown 見出し（# 〜 ######）をはてな記法見出しへ変換する
 */
export function markdownHeadingToHatena(
  md: string,
  options?: HeadingConvertOptions,
): string {
  const parsed = parseMarkdownHeading(md);
  if (!parsed) return md;
  const level = clampLevel(parsed.level, options);
  return `${'*'.repeat(level)} ${parsed.text}`;
}
