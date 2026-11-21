import { describe, expect, it } from 'vitest';
import {
  buildHatenaEntryXml,
  parseHatenaBlogPublicFeedXml,
  parseHatenaCategoriesXml,
  parseHatenaEntriesFeedXml,
  parseHatenaEntryXml,
  parseHatenaServiceDocumentXml,
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

  it('parseHatenaEntriesFeedXml がフィード一覧と nextUrl・メタ情報・補助フィールドをパースすること', () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:app="http://www.w3.org/2007/app" xmlns:hatenablog="http://www.hatena.ne.jp/info/xmlns#hatenablog" xmlns:hatena="http://www.hatena.ne.jp/info/xmlns#">
  <title>たろうのブログ</title>
  <link rel="alternate" href="https://taro.hatenablog.com/" />
  <link rel="next" href="https://blog.hatena.ne.jp/taro/taro.hatenablog.com/atom/entry?page=2" />
  <entry>
    <id>tag:blog.hatena.ne.jp,2013:blog-1-2</id>
    <link rel="edit" href="https://blog.hatena.ne.jp/taro/taro.hatenablog.com/atom/entry/12345" />
    <link rel="alternate" type="text/html" href="https://taro.hatenablog.com/entry/my-post" />
    <link rel="preview" type="text/html" href="https://blog.hatena.ne.jp/-/preview/abc" />
    <author><name>taro</name></author>
    <title>公開記事</title>
    <summary type="text">記事の要約</summary>
    <content type="text/x-markdown">本文</content>
    <hatena:formatted-content type="text/html"><div class="section"><p>本文</p></div></hatena:formatted-content>
    <published>2026-11-19T10:00:00+09:00</published>
    <updated>2026-11-19T10:05:00+09:00</updated>
    <app:edited>2026-11-19T10:10:00+09:00</app:edited>
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
    expect(feed.title).toBe('たろうのブログ');
    expect(feed.blogUrl).toBe('https://taro.hatenablog.com/');
    expect(feed.nextUrl).toBe(
      'https://blog.hatena.ne.jp/taro/taro.hatenablog.com/atom/entry?page=2',
    );
    expect(feed.entries).toHaveLength(2);
    expect(feed.entries[0]).toMatchObject({
      entryId: '12345',
      type: 'post',
      title: '公開記事',
      content: '本文',
      formattedContent: '<div class="section"><p>本文</p></div>',
      summary: '記事の要約',
      author: 'taro',
      format: 'markdown',
      status: 'published',
      externalUrl: 'https://taro.hatenablog.com/entry/my-post',
      previewUrl: 'https://blog.hatena.ne.jp/-/preview/abc',
      customUrl: 'my-post',
      categories: ['日記'],
      updatedAt: new Date('2026-11-19T10:05:00+09:00'),
      editedAt: new Date('2026-11-19T10:10:00+09:00'),
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

  it('parseHatenaServiceDocumentXml がサービス文書をパースすること', () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<service xmlns="http://www.w3.org/2007/app" xmlns:atom="http://www.w3.org/2005/Atom">
  <workspace>
    <atom:title>たろうのブログ</atom:title>
    <collection href="https://blog.hatena.ne.jp/taro/taro.hatenablog.com/atom/entry">
      <atom:title>たろうのブログ</atom:title>
      <accept>application/atom+xml;type=entry</accept>
      <categories href="https://blog.hatena.ne.jp/taro/taro.hatenablog.com/atom/category" />
    </collection>
  </workspace>
</service>`;

    expect(parseHatenaServiceDocumentXml(xml)).toEqual({
      workspaceTitle: 'たろうのブログ',
      collections: [
        {
          href: 'https://blog.hatena.ne.jp/taro/taro.hatenablog.com/atom/entry',
          title: 'たろうのブログ',
          accepts: ['application/atom+xml;type=entry'],
          categoriesHref:
            'https://blog.hatena.ne.jp/taro/taro.hatenablog.com/atom/category',
        },
      ],
    });
  });

  it('parseHatenaBlogPublicFeedXml が RSS 2.0 フィードをパースすること', () => {
    const rssXml = `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>開発ブログ</title>
    <link>https://staff.hatenablog.com/</link>
    <description>はてなブログのお知らせ</description>
    <item>
      <title>新機能のお知らせ</title>
      <link>https://staff.hatenablog.com/entry/2026/11/21</link>
      <description>概要テキスト</description>
      <content:encoded><![CDATA[<p>本文HTML</p>]]></content:encoded>
      <dc:creator>hatenablog</dc:creator>
      <category>お知らせ</category>
      <category>新機能</category>
      <pubDate>Sat, 21 Nov 2026 09:00:00 +0900</pubDate>
    </item>
  </channel>
</rss>`;

    const feed = parseHatenaBlogPublicFeedXml(rssXml);
    expect(feed).toEqual({
      format: 'rss',
      title: '開発ブログ',
      description: 'はてなブログのお知らせ',
      blogUrl: 'https://staff.hatenablog.com/',
      items: [
        {
          title: '新機能のお知らせ',
          url: 'https://staff.hatenablog.com/entry/2026/11/21',
          description: '概要テキスト',
          content: '<p>本文HTML</p>',
          author: 'hatenablog',
          categories: ['お知らせ', '新機能'],
          publishedAt: new Date('Sat, 21 Nov 2026 09:00:00 +0900'),
          updatedAt: null,
        },
      ],
    });
  });

  it('parseHatenaBlogPublicFeedXml が Atom 1.0 フィードをパースすること', () => {
    const atomXml = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>開発ブログ</title>
  <subtitle>サブタイトル</subtitle>
  <link rel="alternate" href="https://staff.hatenablog.com/" />
  <entry>
    <title>Atom 記事</title>
    <link rel="alternate" href="https://staff.hatenablog.com/entry/atom-1" />
    <summary>要約</summary>
    <content type="html">&lt;p&gt;HTML&lt;/p&gt;</content>
    <author><name>taro</name></author>
    <category term="Tech" />
    <published>2026-11-21T09:00:00+09:00</published>
    <updated>2026-11-21T10:00:00+09:00</updated>
  </entry>
</feed>`;

    const feed = parseHatenaBlogPublicFeedXml(atomXml);
    expect(feed).toEqual({
      format: 'atom',
      title: '開発ブログ',
      description: 'サブタイトル',
      blogUrl: 'https://staff.hatenablog.com/',
      items: [
        {
          title: 'Atom 記事',
          url: 'https://staff.hatenablog.com/entry/atom-1',
          description: '要約',
          content: '<p>HTML</p>',
          author: 'taro',
          categories: ['Tech'],
          publishedAt: new Date('2026-11-21T09:00:00+09:00'),
          updatedAt: new Date('2026-11-21T10:00:00+09:00'),
        },
      ],
    });
  });
});
