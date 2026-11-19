import { describe, expect, it } from 'vitest';
import {
  buildHatenaEntryXml,
  parseHatenaCategoriesXml,
  parseHatenaEntriesFeedXml,
  parseHatenaEntryXml,
} from './blog-xml.js';

describe('blog-xml', () => {
  it('buildHatenaEntryXml が下書き・予約投稿・カスタムURL・カテゴリを含む XML を生成すること', () => {
    const xml = buildHatenaEntryXml({
      title: 'テスト <記事>',
      content: '# 見出し\n本文 & リンク',
      format: 'markdown',
      categories: ['Tech', ' TypeScript ', ''],
      updated: new Date('2026-11-20T00:00:00.000Z'),
      draft: true,
      scheduled: true,
      preview: true,
      customUrl: 'test-slug',
    });

    expect(xml).toContain('<title>テスト &lt;記事&gt;</title>');
    expect(xml).toContain(
      '<content type="text/x-markdown"># 見出し\n本文 &amp; リンク</content>',
    );
    expect(xml).toContain('<updated>2026-11-20T00:00:00.000Z</updated>');
    expect(xml).toContain(
      '<hatenablog:custom-url>test-slug</hatenablog:custom-url>',
    );
    expect(xml).toContain('<category term="Tech" />');
    expect(xml).toContain('<category term="TypeScript" />');
    expect(xml).toContain('<app:draft>yes</app:draft>');
    expect(xml).toContain('<hatenablog:scheduled>yes</hatenablog:scheduled>');
    expect(xml).toContain('<app:preview>yes</app:preview>');
  });

  it('parseHatenaEntriesFeedXml がフィード一覧と nextUrl をパースすること', () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:app="http://www.w3.org/2007/app" xmlns:hatenablog="http://www.hatena.ne.jp/info/xmlns#hatenablog">
  <link rel="next" href="https://blog.hatena.ne.jp/taro/taro.hatenablog.com/atom/entry?page=2" />
  <entry>
    <id>tag:blog.hatena.ne.jp,2013:blog-1-2</id>
    <link rel="edit" href="https://blog.hatena.ne.jp/taro/taro.hatenablog.com/atom/entry/12345" />
    <link rel="alternate" type="text/html" href="https://taro.hatenablog.com/entry/my-post" />
    <link rel="preview" type="text/html" href="https://blog.hatena.ne.jp/-/preview/abc" />
    <title>公開記事</title>
    <content type="text/x-markdown">本文</content>
    <published>2026-11-19T10:00:00+09:00</published>
    <category term="日記" />
    <app:control>
      <app:draft>no</app:draft>
    </app:control>
  </entry>
  <entry>
    <link rel="edit" href="https://blog.hatena.ne.jp/taro/taro.hatenablog.com/atom/entry/67890" />
    <title>予約記事</title>
    <content type="text/x-hatena-syntax">*見出し</content>
    <updated>2026-11-25T10:00:00+09:00</updated>
    <app:control>
      <app:draft>yes</app:draft>
      <hatenablog:scheduled>yes</hatenablog:scheduled>
    </app:control>
  </entry>
</feed>`;

    const feed = parseHatenaEntriesFeedXml(xml);
    expect(feed.nextUrl).toBe(
      'https://blog.hatena.ne.jp/taro/taro.hatenablog.com/atom/entry?page=2',
    );
    expect(feed.entries).toHaveLength(2);
    expect(feed.entries[0]).toMatchObject({
      entryId: '12345',
      type: 'post',
      title: '公開記事',
      content: '本文',
      format: 'markdown',
      status: 'published',
      externalUrl: 'https://taro.hatenablog.com/entry/my-post',
      previewUrl: 'https://blog.hatena.ne.jp/-/preview/abc',
      customUrl: 'my-post',
      categories: ['日記'],
    });
    expect(feed.entries[1]).toMatchObject({
      entryId: '67890',
      title: '予約記事',
      format: 'hatena',
      status: 'scheduled',
    });
  });

  it('parseHatenaEntryXml が固定ページ単体 XML をパースすること', () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<entry xmlns="http://www.w3.org/2005/Atom" xmlns:app="http://www.w3.org/2007/app" xmlns:hatenablog="http://www.hatena.ne.jp/info/xmlns#hatenablog">
  <link rel="edit" href="https://blog.hatena.ne.jp/taro/taro.hatenablog.com/atom/page/999" />
  <link rel="alternate" type="text/html" href="https://taro.hatenablog.com/about" />
  <title>このブログについて</title>
  <content type="text/html">&lt;p&gt;自己紹介&lt;/p&gt;</content>
  <hatenablog:custom-url>about</hatenablog:custom-url>
  <app:control>
    <app:draft>yes</app:draft>
  </app:control>
</entry>`;

    const entry = parseHatenaEntryXml(xml, { type: 'page' });
    expect(entry).toMatchObject({
      entryId: '999',
      type: 'page',
      title: 'このブログについて',
      content: '<p>自己紹介</p>',
      format: 'html',
      status: 'draft',
      customUrl: 'about',
    });
  });

  it('parseHatenaCategoriesXml がカテゴリー一覧を抽出すること', () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<app:categories xmlns:app="http://www.w3.org/2007/app" xmlns:atom="http://www.w3.org/2005/Atom">
  <atom:category term="Tech" />
  <atom:category term="日記" />
  <atom:category term="Tech" />
</app:categories>`;

    expect(parseHatenaCategoriesXml(xml)).toEqual(['Tech', '日記']);
  });
});
