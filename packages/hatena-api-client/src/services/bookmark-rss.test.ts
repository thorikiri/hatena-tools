import { describe, expect, it } from 'vitest';
import { parseHatenaBookmarkRssXml } from './bookmark-rss.js';

describe('parseHatenaBookmarkRssXml', () => {
  it('はてなブックマーク RSS 1.0 (RDF) からアイテム一覧を抽出すること', () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<rdf:RDF
  xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
  xmlns="http://purl.org/rss/1.0/"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:hatena="http://www.hatena.ne.jp/info/xmlns#">
  <channel rdf:about="https://b.hatena.ne.jp/hotentry">
    <title>はてなブックマーク - 人気エントリー</title>
  </channel>
  <item rdf:about="https://example.com/1">
    <title>TypeScript &amp; Node.js 入門</title>
    <link>https://example.com/1</link>
    <description>とてもわかりやすい記事</description>
    <dc:subject>TypeScript</dc:subject>
    <dc:subject>Node.js</dc:subject>
    <dc:subject>TypeScript</dc:subject>
    <dc:date>2026-11-19T12:00:00Z</dc:date>
    <hatena:bookmarkcount>42</hatena:bookmarkcount>
  </item>
  <item rdf:about="https://example.com/2">
    <title></title>
    <link>https://example.com/2</link>
  </item>
</rdf:RDF>`;

    const items = parseHatenaBookmarkRssXml(xml);
    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({
      title: 'TypeScript & Node.js 入門',
      url: 'https://example.com/1',
      comment: 'とてもわかりやすい記事',
      tags: ['TypeScript', 'Node.js'],
      bookmarkCount: 42,
      date: new Date('2026-11-19T12:00:00Z'),
    });
    expect(items[1]).toMatchObject({
      title: 'https://example.com/2',
      url: 'https://example.com/2',
      comment: '',
      tags: [],
      bookmarkCount: undefined,
    });
  });

  it('空文字や不正XMLの場合は空配列を返すこと', () => {
    expect(parseHatenaBookmarkRssXml('')).toEqual([]);
  });
});
