import { parseHatenaPhotoSyntax } from '../parser/photo-syntax.js';
import { escapeHtml, unescapeHtml } from '../utils/html.js';

const EXT_TO_CODE_MAP: Record<string, string> = {
  jpg: 'j',
  jpeg: 'j',
  png: 'p',
  gif: 'g',
  bmp: 'b',
};

const FOTOLIFE_CDN_REGEX =
  /https?:\/\/(?:cdn-ak\.f\.st-hatena\.com|f\.hatena\.ne\.jp)\/images\/fotolife\/[a-z0-9]\/([a-zA-Z0-9_-]+)\/(\d{8})\/(\d{14})\.([a-zA-Z0-9]+)/i;

export interface HatenaPhotoToHtmlOptions {
  alt?: string;
  className?: string;
  loading?: 'lazy' | 'eager';
}

export interface HatenaPhotoToMarkdownOptions {
  alt?: string;
}

export interface ImageUrlToHatenaPhotoOptions {
  /** 付与するオプション接尾辞（デフォルト: ":image"） */
  syntaxOptions?: string;
}

/**
 * はてなフォトライフ記法を整形する（角括弧がない場合は [f:id:...] で囲む）
 */
export function formatHatenaPhotoSyntax(
  syntaxOrUrl?: string | null,
  filename?: string,
): string {
  if (!syntaxOrUrl) return '';
  const trimmed = syntaxOrUrl.trim();

  if (/^\[f:id:[^\]]+\]$/.test(trimmed)) {
    return trimmed;
  }

  if (trimmed.startsWith('f:id:')) {
    return `[${trimmed}]`;
  }

  if (trimmed.startsWith('![') || trimmed.startsWith('<img')) {
    return trimmed;
  }

  return `![${filename || 'image'}](${trimmed})`;
}

/**
 * はてなフォトライフ記法単体を <img> タグへ変換する
 */
export function hatenaPhotoToHtml(
  syntax: string,
  options?: HatenaPhotoToHtmlOptions,
): string {
  const parsed = parseHatenaPhotoSyntax(syntax);
  if (!parsed) return '';

  const alt = options?.alt ?? parsed.syntax;
  const attrs = [
    `src="${escapeHtml(parsed.imageUrl)}"`,
    `alt="${escapeHtml(alt)}"`,
    ...(options?.className ? [`class="${escapeHtml(options.className)}"`] : []),
    ...(options?.loading ? [`loading="${options.loading}"`] : []),
  ];

  return `<img ${attrs.join(' ')} />`;
}

/**
 * はてなフォトライフ記法単体を Markdown 画像記法へ変換する
 */
export function hatenaPhotoToMarkdown(
  syntax: string,
  options?: HatenaPhotoToMarkdownOptions,
): string {
  const parsed = parseHatenaPhotoSyntax(syntax);
  if (!parsed) return '';

  const alt = options?.alt ?? parsed.syntax;
  return `![${alt}](${parsed.imageUrl})`;
}

/**
 * はてなフォトライフ CDN 画像 URL を [f:id:...] 記法へ逆変換する
 */
export function imageUrlToHatenaPhoto(
  url: string,
  options?: ImageUrlToHatenaPhotoOptions,
): string | null {
  const match = FOTOLIFE_CDN_REGEX.exec(url.trim());
  if (!match) return null;

  const [, user, , photoId, ext] = match;
  if (!user || !photoId || !ext) return null;

  const extCode = EXT_TO_CODE_MAP[ext.toLowerCase()] ?? 'j';
  const suffix = options?.syntaxOptions ?? ':image';
  return `[f:id:${user}:${photoId}${extCode}${suffix}]`;
}

/**
 * <img> タグ文字列から [f:id:...] 記法へ逆変換する
 */
export function htmlImgToHatenaPhoto(imgHtml: string): string | null {
  const altMatch = /\balt\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(imgHtml);
  const altValue = unescapeHtml(altMatch?.[1] ?? altMatch?.[2] ?? '');
  if (altValue.includes('f:id:')) {
    const parsed = parseHatenaPhotoSyntax(altValue);
    if (parsed) return `[${parsed.syntax}]`;
  }

  const srcMatch = /\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(imgHtml);
  const srcValue = unescapeHtml(srcMatch?.[1] ?? srcMatch?.[2] ?? '');
  if (srcValue) {
    return imageUrlToHatenaPhoto(srcValue);
  }

  return null;
}
