import type {
  BuildHatenaEntryXmlOptions,
  HatenaBlogCollection,
  HatenaBlogEntry,
  HatenaBlogEntryStatus,
  HatenaBlogEntryType,
  HatenaBlogFeed,
  HatenaBlogFormat,
  HatenaBlogPublicFeed,
  HatenaBlogPublicFeedItem,
  HatenaBlogServiceDocument,
} from '../types.js';
import {
  escapeXml,
  findAllDescendants,
  findChild,
  findChildren,
  getInnerXml,
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

function parseOptionalDate(raw?: string): Date | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseEntryElement(
  el: XmlElement,
  entryType: HatenaBlogEntryType,
): HatenaBlogEntry {
  const title = findChild(el, 'title')?.text.trim() || '無題';
  const contentEl = findChild(el, 'content');
  const content = contentEl?.text ?? '';
  const format = mapContentTypeToFormat(contentEl?.attributes.type);

  const formattedContentEl = findChild(el, 'formatted-content');
  const formattedContent = formattedContentEl
    ? getInnerXml(formattedContentEl).trim() || null
    : null;
  const summary = findChild(el, 'summary')?.text.trim() || null;
  const authorEl = findChild(el, 'author');
  const author =
    (authorEl ? findChild(authorEl, 'name')?.text.trim() : undefined) || null;

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

  const updatedAt = parseOptionalDate(findChild(el, 'updated')?.text);
  const editedAt = parseOptionalDate(findChild(el, 'edited')?.text);
  const publishedAt =
    parseOptionalDate(findChild(el, 'published')?.text) ??
    updatedAt ??
    new Date();

  return {
    entryId,
    type: entryType,
    title,
    content,
    formattedContent,
    summary,
    author,
    format,
    status,
    externalUrl,
    previewUrl,
    editUrl,
    customUrl,
    categories: Array.from(categorySet),
    publishedAt,
    updatedAt,
    editedAt,
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
    return { title: null, blogUrl: null, nextUrl: null, entries: [] };
  }

  if (root.localName === 'entry') {
    return {
      title: null,
      blogUrl: null,
      nextUrl: null,
      entries: [parseEntryElement(root, entryType)],
    };
  }

  const feedTitle = findChild(root, 'title')?.text.trim() || null;
  const feedLinks = findChildren(root, 'link');
  const blogUrl = sanitizeHttpUrl(
    feedLinks.find((l) => l.attributes.rel === 'alternate')?.attributes.href,
  );
  const nextUrl = sanitizeHttpUrl(
    feedLinks.find((l) => l.attributes.rel === 'next')?.attributes.href,
  );

  const entries = findChildren(root, 'entry').map((el) =>
    parseEntryElement(el, entryType),
  );

  return { title: feedTitle, blogUrl, nextUrl, entries };
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
 * はてなブログ AtomPub のサービス文書 XML（GET /atom）をパースする
 */
export function parseHatenaServiceDocumentXml(
  xml: string,
): HatenaBlogServiceDocument {
  const root = parseXml(xml);
  if (!root) {
    return { workspaceTitle: null, collections: [] };
  }

  const workspaceEl =
    root.localName === 'workspace' ? root : findChild(root, 'workspace');
  if (!workspaceEl) {
    return { workspaceTitle: null, collections: [] };
  }

  const workspaceTitle = findChild(workspaceEl, 'title')?.text.trim() || null;

  const collections: HatenaBlogCollection[] = findChildren(
    workspaceEl,
    'collection',
  )
    .map((col) => {
      const href = col.attributes.href?.trim() ?? '';
      const title = findChild(col, 'title')?.text.trim() || null;
      const accepts = findChildren(col, 'accept')
        .map((a) => a.text.trim())
        .filter(Boolean);
      const categoriesEl = findChild(col, 'categories');
      const categoriesHref =
        sanitizeHttpUrl(categoriesEl?.attributes.href) ?? null;

      return {
        href,
        title,
        accepts,
        categoriesHref,
      };
    })
    .filter((c) => Boolean(c.href));

  return { workspaceTitle, collections };
}

/**
 * 公開はてなブログの RSS 2.0 / Atom 1.0 フィード XML をパースする
 */
export function parseHatenaBlogPublicFeedXml(
  xml: string,
): HatenaBlogPublicFeed {
  const root = parseXml(xml);
  if (!root) {
    return {
      format: 'rss',
      title: null,
      description: null,
      blogUrl: null,
      items: [],
    };
  }

  // Atom 1.0 (<feed>)
  if (root.localName === 'feed') {
    const title = findChild(root, 'title')?.text.trim() || null;
    const description = findChild(root, 'subtitle')?.text.trim() || null;
    const feedLinks = findChildren(root, 'link');
    const blogUrl = sanitizeHttpUrl(
      (
        feedLinks.find((l) => l.attributes.rel === 'alternate') ??
        feedLinks.find((l) => !l.attributes.rel)
      )?.attributes.href,
    );

    const items: HatenaBlogPublicFeedItem[] = [];
    for (const entry of findChildren(root, 'entry')) {
      const entryLinks = findChildren(entry, 'link');
      const altLink =
        entryLinks.find((l) => l.attributes.rel === 'alternate') ??
        entryLinks[0];
      const url = sanitizeHttpUrl(altLink?.attributes.href);
      if (!url) continue;

      const itemTitle = findChild(entry, 'title')?.text.trim() || url;
      const summary = findChild(entry, 'summary')?.text.trim() ?? '';
      const contentEl = findChild(entry, 'content');
      const content = contentEl ? getInnerXml(contentEl).trim() || null : null;
      const authorEl = findChild(entry, 'author');
      const author =
        (authorEl ? findChild(authorEl, 'name')?.text.trim() : undefined) ||
        null;

      const categorySet = new Set<string>();
      for (const catEl of findChildren(entry, 'category')) {
        const term = catEl.attributes.term?.trim() || catEl.text.trim();
        if (term) categorySet.add(term);
      }

      items.push({
        title: itemTitle,
        url,
        description: summary,
        content,
        author,
        categories: Array.from(categorySet),
        publishedAt: parseOptionalDate(findChild(entry, 'published')?.text),
        updatedAt: parseOptionalDate(findChild(entry, 'updated')?.text),
      });
    }

    return {
      format: 'atom',
      title,
      description,
      blogUrl,
      items,
    };
  }

  // RSS 2.0 (<rss><channel>...)
  const channel =
    root.localName === 'channel' ? root : findChild(root, 'channel');
  if (!channel) {
    return {
      format: 'rss',
      title: null,
      description: null,
      blogUrl: null,
      items: [],
    };
  }

  const title = findChild(channel, 'title')?.text.trim() || null;
  const description = findChild(channel, 'description')?.text.trim() || null;
  const blogUrl = sanitizeHttpUrl(findChild(channel, 'link')?.text);

  const items: HatenaBlogPublicFeedItem[] = [];
  for (const item of findChildren(channel, 'item')) {
    const url = sanitizeHttpUrl(findChild(item, 'link')?.text);
    if (!url) continue;

    const itemTitle = findChild(item, 'title')?.text.trim() || url;
    const itemDesc = findChild(item, 'description')?.text.trim() ?? '';
    const encodedEl = findChild(item, 'encoded');
    const content = encodedEl ? getInnerXml(encodedEl).trim() || null : null;
    const author =
      findChild(item, 'creator')?.text.trim() ||
      findChild(item, 'author')?.text.trim() ||
      null;

    const categorySet = new Set<string>();
    for (const catEl of findChildren(item, 'category')) {
      const cat = catEl.text.trim();
      if (cat) categorySet.add(cat);
    }

    const publishedAt = parseOptionalDate(findChild(item, 'pubDate')?.text);

    items.push({
      title: itemTitle,
      url,
      description: itemDesc,
      content,
      author,
      categories: Array.from(categorySet),
      publishedAt,
      updatedAt: null,
    });
  }

  return {
    format: 'rss',
    title,
    description,
    blogUrl,
    items,
  };
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
