import type { HatenaBookmarkRssItem } from '../types.js';
import {
  findAllDescendants,
  findChild,
  findChildren,
  parseXml,
} from '../xml/simple-xml.js';

/**
 * はてなブックマークの RSS 1.0 (RDF) XML をパースする
 */
export function parseHatenaBookmarkRssXml(
  xml: string,
): HatenaBookmarkRssItem[] {
  const root = parseXml(xml);
  if (!root) return [];

  const itemElements = findAllDescendants(root, 'item');
  const items: HatenaBookmarkRssItem[] = [];

  for (const el of itemElements) {
    const url = findChild(el, 'link')?.text.trim() ?? '';
    if (!url) continue;

    const title = findChild(el, 'title')?.text.trim() || url;
    const comment = findChild(el, 'description')?.text.trim() ?? '';

    const tagSet = new Set<string>();
    for (const subjectEl of findChildren(el, 'subject')) {
      const tag = subjectEl.text.trim();
      if (tag) tagSet.add(tag);
    }

    const rawCount = findChild(el, 'bookmarkcount')?.text.trim();
    const parsedCount = rawCount ? Number.parseInt(rawCount, 10) : undefined;
    const bookmarkCount =
      parsedCount !== undefined && !Number.isNaN(parsedCount)
        ? parsedCount
        : undefined;

    const rawDate = findChild(el, 'date')?.text.trim();
    const parsedDate = rawDate ? new Date(rawDate) : new Date();
    const date = Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate;

    items.push({
      title,
      url,
      comment,
      tags: Array.from(tagSet),
      bookmarkCount,
      date,
    });
  }

  return items;
}
