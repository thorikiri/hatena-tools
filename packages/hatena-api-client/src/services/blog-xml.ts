import type {
  BuildHatenaEntryXmlOptions,
  HatenaBlogEntry,
  HatenaBlogEntryStatus,
  HatenaBlogEntryType,
  HatenaBlogFeed,
  HatenaBlogFormat,
} from '../types.js';
import {
  escapeXml,
  findAllDescendants,
  findChild,
  findChildren,
  parseXml,
  type XmlElement,
} from '../xml/simple-xml.js';

function mapContentTypeToFormat(contentType?: string): HatenaBlogFormat {
  const normalized = (contentType ?? '').toLowerCase();
  if (normalized.includes('text/html')) return 'html';
  if (normalized.includes('hatena-syntax')) return 'hatena';
  return 'markdown';
}

function mapFormatToContentType(format: HatenaBlogFormat): string {
  if (format === 'html') return 'text/html';
  if (format === 'hatena') return 'text/x-hatena-syntax';
  return 'text/x-markdown';
}

function sanitizeHttpUrl(rawUrl?: string): string | null {
  const trimmed = rawUrl?.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (
      (parsed.protocol === 'https:' || parsed.protocol === 'http:') &&
      parsed.username === '' &&
      parsed.password === ''
    ) {
      return trimmed;
    }
    return null;
  } catch {
    return null;
  }
}

function extractEntryIdFromEditUrl(
  editUrl: string | null,
  fallbackId?: string,
): string {
  if (editUrl) {
    const match = editUrl.match(/\/atom\/(?:entry|page)\/([^/?#]+)/);
    if (match?.[1]) return match[1];
  }
  return fallbackId?.trim() ?? '';
}

function extractBasenameFromUrl(
  url: string | null,
  entryType: HatenaBlogEntryType,
): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (entryType === 'page') {
      const slug = parsed.pathname.replace(/^\/+|\/+$/g, '');
      return slug || null;
    }
    const entryIndex = parsed.pathname.indexOf('/entry/');
    if (entryIndex === -1) return null;
    const slug = parsed.pathname
      .slice(entryIndex + '/entry/'.length)
      .replace(/^\/+/, '');
    return slug || null;
  } catch {
    return null;
  }
}

function parseEntryElement(
  el: XmlElement,
  entryType: HatenaBlogEntryType,
): HatenaBlogEntry {
  const title = findChild(el, 'title')?.text.trim() || '無題';
  const contentEl = findChild(el, 'content');
  const content = contentEl?.text ?? '';
  const format = mapContentTypeToFormat(contentEl?.attributes.type);

  const draftEl = findAllDescendants(el, 'draft')[0];
  const isDraft = draftEl?.text.trim().toLowerCase() === 'yes';
  const scheduledEl = findAllDescendants(el, 'scheduled')[0];
  const isScheduled = scheduledEl?.text.trim().toLowerCase() === 'yes';

  const status: HatenaBlogEntryStatus = isDraft
    ? isScheduled
      ? 'scheduled'
      : 'draft'
    : 'published';

  const links = findChildren(el, 'link');
  const editUrl =
    sanitizeHttpUrl(
      links.find((l) => l.attributes.rel === 'edit')?.attributes.href,
    ) ?? null;

  const alternateLink =
    links.find(
      (l) =>
        l.attributes.rel === 'alternate' && l.attributes.type === 'text/html',
    ) ?? links.find((l) => l.attributes.rel === 'alternate');
  const externalUrl = sanitizeHttpUrl(alternateLink?.attributes.href);

  const previewLink =
    links.find(
      (l) =>
        l.attributes.rel === 'preview' && l.attributes.type === 'text/html',
    ) ?? links.find((l) => l.attributes.rel === 'preview');
  const previewUrl = sanitizeHttpUrl(previewLink?.attributes.href);

  const rawId = findChild(el, 'id')?.text;
  const entryId = extractEntryIdFromEditUrl(editUrl, rawId);

  const customUrlEl = findAllDescendants(el, 'custom-url')[0];
  const rawCustomUrl = customUrlEl?.text.trim() || null;
  const customUrl =
    entryType === 'page'
      ? (rawCustomUrl ?? extractBasenameFromUrl(externalUrl, 'page'))
      : (rawCustomUrl ?? extractBasenameFromUrl(externalUrl, 'post'));

  const categorySet = new Set<string>();
  for (const catEl of findChildren(el, 'category')) {
    const term = catEl.attributes.term?.trim();
    if (term) categorySet.add(term);
  }

  const publishedStr =
    findChild(el, 'published')?.text.trim() ||
    findChild(el, 'updated')?.text.trim();
  const parsedDate = publishedStr ? new Date(publishedStr) : new Date();
  const publishedAt = Number.isNaN(parsedDate.getTime())
    ? new Date()
    : parsedDate;

  return {
    entryId,
    type: entryType,
    title,
    content,
    format,
    status,
    externalUrl,
    previewUrl,
    editUrl,
    customUrl,
    categories: Array.from(categorySet),
    publishedAt,
  };
}

/**
 * はてなブログ AtomPub の記事・固定ページ一覧フィード XML をパースする
 */
export function parseHatenaEntriesFeedXml(
  xml: string,
  options?: { type?: HatenaBlogEntryType },
): HatenaBlogFeed {
  const root = parseXml(xml);
  const entryType: HatenaBlogEntryType = options?.type ?? 'post';
  if (!root) {
    return { nextUrl: null, entries: [] };
  }

  if (root.localName === 'entry') {
    return {
      nextUrl: null,
      entries: [parseEntryElement(root, entryType)],
    };
  }

  const nextLink = findChildren(root, 'link').find(
    (l) => l.attributes.rel === 'next',
  );
  const nextUrl = sanitizeHttpUrl(nextLink?.attributes.href);

  const entries = findChildren(root, 'entry').map((el) =>
    parseEntryElement(el, entryType),
  );

  return { nextUrl, entries };
}

/**
 * はてなブログ AtomPub の単一エントリ XML をパースする
 */
export function parseHatenaEntryXml(
  xml: string,
  options?: { type?: HatenaBlogEntryType },
): HatenaBlogEntry | null {
  const { entries } = parseHatenaEntriesFeedXml(xml, options);
  return entries[0] ?? null;
}

/**
 * はてなブログ AtomPub のカテゴリー文書 XML をパースする
 */
export function parseHatenaCategoriesXml(xml: string): string[] {
  const root = parseXml(xml);
  if (!root) return [];

  const names = new Set<string>();
  for (const el of findAllDescendants(root, 'category')) {
    const term = el.attributes.term?.trim();
    if (term) names.add(term);
  }
  return Array.from(names);
}

/**
 * はてなブログ AtomPub API（POST / PUT）送信用の Atom XML を組み立てる
 */
export function buildHatenaEntryXml(
  options: BuildHatenaEntryXmlOptions,
): string {
  const contentType = mapFormatToContentType(options.format ?? 'markdown');
  const updatedIso = (options.updated ?? new Date()).toISOString();
  const isEffectiveDraft = Boolean(options.draft || options.scheduled);
  const draftValue = isEffectiveDraft ? 'yes' : 'no';

  const categoryTags = (options.categories ?? [])
    .map((cat) => cat.trim())
    .filter(Boolean)
    .map((cat) => `  <category term="${escapeXml(cat)}" />`)
    .join('\n');

  const trimmedCustomUrl = options.customUrl?.trim();

  const controlTags = [
    `    <app:draft>${draftValue}</app:draft>`,
    ...(isEffectiveDraft && options.scheduled === true
      ? ['    <hatenablog:scheduled>yes</hatenablog:scheduled>']
      : []),
    ...(isEffectiveDraft && options.scheduled === false
      ? ['    <hatenablog:scheduled>no</hatenablog:scheduled>']
      : []),
    ...(isEffectiveDraft && options.preview
      ? ['    <app:preview>yes</app:preview>']
      : []),
  ];

  const lines = [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<entry xmlns="http://www.w3.org/2005/Atom" xmlns:app="http://www.w3.org/2007/app" xmlns:hatenablog="http://www.hatena.ne.jp/info/xmlns#hatenablog">',
    `  <title>${escapeXml(options.title)}</title>`,
    `  <content type="${contentType}">${escapeXml(options.content)}</content>`,
    `  <updated>${updatedIso}</updated>`,
    ...(trimmedCustomUrl
      ? [
          `  <hatenablog:custom-url>${escapeXml(trimmedCustomUrl)}</hatenablog:custom-url>`,
        ]
      : []),
    ...(categoryTags ? [categoryTags] : []),
    '  <app:control>',
    ...controlTags,
    '  </app:control>',
    '</entry>',
  ];

  return lines.join('\n');
}
