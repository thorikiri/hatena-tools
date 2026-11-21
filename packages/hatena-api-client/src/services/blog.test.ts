import { describe, expect, it, vi } from 'vitest';
import { HatenaClient } from '../client.js';
import { HatenaApiError } from '../errors.js';
import {
  buildHatenaBlogPublicFeedUrl,
  fetchHatenaBlogOEmbed,
  fetchHatenaBlogPublicFeed,
} from './blog.js';

const ENTRY_RESPONSE_XML = `<?xml version="1.0" encoding="utf-8"?>
<entry xmlns="http://www.w3.org/2005/Atom" xmlns:app="http://www.w3.org/2007/app">
  <link rel="edit" href="https://blog.hatena.ne.jp/taro/taro.hatenablog.com/atom/entry/1001" />
  <link rel="alternate" type="text/html" href="https://taro.hatenablog.com/entry/hello" />
  <title>Hello</title>
  <content type="text/x-markdown">Body</content>
  <published>2026-11-19T12:00:00+09:00</published>
  <app:control>
    <app:draft>no</app:draft>
  </app:control>
</entry>`;

const FEED_RESPONSE_XML = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <link rel="next" href="https://blog.hatena.ne.jp/taro/taro.hatenablog.com/atom/entry?page=2" />
  ${ENTRY_RESPONSE_XML.replace('<?xml version="1.0" encoding="utf-8"?>', '')}
</feed>`;

describe('HatenaBlogClient', () => {
  const createClient = (fetchMock: typeof globalThis.fetch) =>
    new HatenaClient({
      auth: { type: 'wsse', hatenaId: 'taro', apiKey: 'key' },
      blogId: 'taro.hatenablog.com',
      fetch: fetchMock,
    });

  it('getEntries と nextUrl ページネーションが動作すること', async () => {
    const fetchMock = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response(FEED_RESPONSE_XML, { status: 200 }))
      .mockResolvedValueOnce(new Response(FEED_RESPONSE_XML, { status: 200 }));

    const client = createClient(fetchMock);
    const first = await client.blog.getEntries();

    expect(first.entries).toHaveLength(1);
    expect(first.entries[0]?.entryId).toBe('1001');
    expect(first.nextUrl).toBe(
      'https://blog.hatena.ne.jp/taro/taro.hatenablog.com/atom/entry?page=2',
    );
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://blog.hatena.ne.jp/taro/taro.hatenablog.com/atom/entry',
    );

    await client.blog.getEntries({ nextUrl: first.nextUrl });
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      'https://blog.hatena.ne.jp/taro/taro.hatenablog.com/atom/entry?page=2',
    );
  });

  it('不正な nextUrl を SSRF 対策で拒否すること', async () => {
    const fetchMock = vi.fn<typeof globalThis.fetch>();
    const client = createClient(fetchMock);

    await expect(
      client.blog.getEntries({
        nextUrl: 'https://evil.example.com/atom/entry',
      }),
    ).rejects.toMatchObject({
      name: 'HatenaApiError',
      code: 'INVALID_URL',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('createEntry / updateEntry / deleteEntry が正しいエンドポイントとメソッドで呼ばれること', async () => {
    const fetchMock = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response(ENTRY_RESPONSE_XML, { status: 201 }))
      .mockResolvedValueOnce(new Response(ENTRY_RESPONSE_XML, { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));

    const client = createClient(fetchMock);

    const created = await client.blog.createEntry({
      title: 'Hello',
      content: 'Body',
      draft: false,
    });
    expect(created.entryId).toBe('1001');
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://blog.hatena.ne.jp/taro/taro.hatenablog.com/atom/entry',
    );
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('POST');

    await client.blog.updateEntry({
      entryId: '1001',
      title: 'Updated',
      content: 'Updated Body',
    });
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      'https://blog.hatena.ne.jp/taro/taro.hatenablog.com/atom/entry/1001',
    );
    expect(fetchMock.mock.calls[1]?.[1]?.method).toBe('PUT');

    await client.blog.deleteEntry({ entryId: '1001' });
    expect(fetchMock.mock.calls[2]?.[0]).toBe(
      'https://blog.hatena.ne.jp/taro/taro.hatenablog.com/atom/entry/1001',
    );
    expect(fetchMock.mock.calls[2]?.[1]?.method).toBe('DELETE');
  });

  it('固定ページ API (getPages / createPage / updatePage / deletePage) が動作すること', async () => {
    const pageXml = ENTRY_RESPONSE_XML.replace(
      '/atom/entry/1001',
      '/atom/page/2002',
    );
    const fetchMock = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response(pageXml, { status: 200 }))
      .mockResolvedValueOnce(new Response(pageXml, { status: 201 }))
      .mockResolvedValueOnce(new Response(pageXml, { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));

    const client = createClient(fetchMock);

    const list = await client.blog.getPages();
    expect(list.entries[0]?.type).toBe('page');
    expect(list.entries[0]?.entryId).toBe('2002');
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://blog.hatena.ne.jp/taro/taro.hatenablog.com/atom/page',
    );

    await client.blog.createPage({ title: 'About', content: 'Me' });
    expect(fetchMock.mock.calls[1]?.[1]?.method).toBe('POST');

    await client.blog.updatePage({
      pageId: '2002',
      title: 'About',
      content: 'Me2',
    });
    expect(fetchMock.mock.calls[2]?.[0]).toBe(
      'https://blog.hatena.ne.jp/taro/taro.hatenablog.com/atom/page/2002',
    );
    expect(fetchMock.mock.calls[2]?.[1]?.method).toBe('PUT');

    await client.blog.deletePage({ pageId: '2002' });
    expect(fetchMock.mock.calls[3]?.[1]?.method).toBe('DELETE');
  });

  it('getCategories がカテゴリー一覧を返すこと', async () => {
    const categoryXml = `<?xml version="1.0" encoding="utf-8"?>
<app:categories xmlns:app="http://www.w3.org/2007/app" xmlns:atom="http://www.w3.org/2005/Atom">
  <atom:category term="Tech" />
  <atom:category term="日記" />
</app:categories>`;

    const fetchMock = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(new Response(categoryXml, { status: 200 }));
    const client = createClient(fetchMock);

    const categories = await client.blog.getCategories();
    expect(categories).toEqual(['Tech', '日記']);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://blog.hatena.ne.jp/taro/taro.hatenablog.com/atom/category',
    );
  });

  it('blogId が未指定の場合は HatenaApiError をスローすること', async () => {
    const client = new HatenaClient({
      auth: { type: 'wsse', hatenaId: 'taro', apiKey: 'key' },
    });

    await expect(client.blog.getEntries()).rejects.toBeInstanceOf(
      HatenaApiError,
    );
  });

  it('getServiceDocument がサービス文書を取得・パースすること', async () => {
    const serviceXml = `<?xml version="1.0" encoding="utf-8"?>
<service xmlns="http://www.w3.org/2007/app" xmlns:atom="http://www.w3.org/2005/Atom">
  <workspace>
    <atom:title>たろうのブログ</atom:title>
    <collection href="https://blog.hatena.ne.jp/taro/taro.hatenablog.com/atom/entry">
      <atom:title>記事</atom:title>
      <accept>application/atom+xml;type=entry</accept>
    </collection>
  </workspace>
</service>`;

    const fetchMock = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(new Response(serviceXml, { status: 200 }));
    const client = createClient(fetchMock);

    const doc = await client.blog.getServiceDocument();
    expect(doc.workspaceTitle).toBe('たろうのブログ');
    expect(doc.collections).toHaveLength(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://blog.hatena.ne.jp/taro/taro.hatenablog.com/atom',
    );
  });

  it('getOEmbed と fetchHatenaBlogOEmbed が oEmbed 情報を取得できること', async () => {
    const oembedPayload = {
      version: '1.0',
      type: 'rich',
      title: 'テスト記事',
      url: 'https://staff.hatenablog.com/entry/2014/08/29/141633',
      description: '記事の概要',
      html: '<iframe src="https://hatenablog-parts.com/embed"></iframe>',
      width: '100%',
      height: '190',
      image_url: 'https://example.com/thumb.png',
      categories: ['Tech', 'News'],
      blog_title: '開発ブログ',
      blog_url: 'https://staff.hatenablog.com/',
      author_name: 'hatenablog',
      author_url: 'https://blog.hatena.ne.jp/hatenablog/',
      provider_name: 'Hatena Blog',
      provider_url: 'https://hatena.blog',
      published: '2014-08-29 14:16:33',
    };

    const fetchMock = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(oembedPayload), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response('Not Found', { status: 404 }));

    const client = createClient(fetchMock);
    const result = await client.blog.getOEmbed({
      url: 'https://staff.hatenablog.com/entry/2014/08/29/141633',
    });

    expect(result).toEqual({
      version: '1.0',
      type: 'rich',
      title: 'テスト記事',
      url: 'https://staff.hatenablog.com/entry/2014/08/29/141633',
      description: '記事の概要',
      html: '<iframe src="https://hatenablog-parts.com/embed"></iframe>',
      width: '100%',
      height: '190',
      imageUrl: 'https://example.com/thumb.png',
      categories: ['Tech', 'News'],
      blogTitle: '開発ブログ',
      blogUrl: 'https://staff.hatenablog.com/',
      authorName: 'hatenablog',
      authorUrl: 'https://blog.hatena.ne.jp/hatenablog/',
      providerName: 'Hatena Blog',
      providerUrl: 'https://hatena.blog',
      published: '2014-08-29 14:16:33',
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://hatena.blog/oembed?url=https%3A%2F%2Fstaff.hatenablog.com%2Fentry%2F2014%2F08%2F29%2F141633&format=json',
    );

    await expect(
      fetchHatenaBlogOEmbed('https://example.com/missing', {
        fetch: fetchMock,
      }),
    ).rejects.toMatchObject({
      name: 'HatenaApiError',
      code: 'NOT_FOUND',
      status: 404,
    });
  });

  it('iterateEntries と getAllEntries が複数ページを自動巡回すること（maxPages・循環防止含む）', async () => {
    const makeFeed = (
      id: string,
      nextUrl?: string,
    ) => `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  ${nextUrl ? `<link rel="next" href="${nextUrl}" />` : ''}
  <entry>
    <link rel="edit" href="https://blog.hatena.ne.jp/taro/taro.hatenablog.com/atom/entry/${id}" />
    <title>Entry ${id}</title>
    <content type="text/x-markdown">Body ${id}</content>
  </entry>
</feed>`;

    const fetchMock = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(
        new Response(
          makeFeed(
            '1',
            'https://blog.hatena.ne.jp/taro/taro.hatenablog.com/atom/entry?page=2',
          ),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          makeFeed(
            '2',
            'https://blog.hatena.ne.jp/taro/taro.hatenablog.com/atom/entry?page=3',
          ),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response(makeFeed('3'), { status: 200 }));

    const client = createClient(fetchMock);
    const all = await client.blog.getAllEntries();

    expect(all.map((e) => e.entryId)).toEqual(['1', '2', '3']);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    // maxPages 指定と同一 nextUrl の循環防止テスト
    const loopMock = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(
        new Response(
          makeFeed(
            '10',
            'https://blog.hatena.ne.jp/taro/taro.hatenablog.com/atom/entry?page=loop',
          ),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          makeFeed(
            '11',
            'https://blog.hatena.ne.jp/taro/taro.hatenablog.com/atom/entry?page=loop',
          ),
          { status: 200 },
        ),
      );

    const loopClient = createClient(loopMock);
    const collected: string[] = [];
    for await (const entry of loopClient.blog.iterateEntries({ maxPages: 5 })) {
      collected.push(entry.entryId);
    }
    expect(collected).toEqual(['10', '11']);
    expect(loopMock).toHaveBeenCalledTimes(2);
  });

  it('iteratePages と getAllPages が固定ページを全件取得できること', async () => {
    const pageFeed = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <link rel="edit" href="https://blog.hatena.ne.jp/taro/taro.hatenablog.com/atom/page/500" />
    <title>About</title>
    <content type="text/html">Hello</content>
  </entry>
</feed>`;

    const fetchMock = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(new Response(pageFeed, { status: 200 }));
    const client = createClient(fetchMock);

    const pages = await client.blog.getAllPages();
    expect(pages).toHaveLength(1);
    expect(pages[0]?.type).toBe('page');
    expect(pages[0]?.entryId).toBe('500');
  });

  it('buildHatenaBlogPublicFeedUrl がドメイン・URLから正しいフィードURLを生成すること', () => {
    expect(buildHatenaBlogPublicFeedUrl('staff.hatenablog.com')).toBe(
      'https://staff.hatenablog.com/rss',
    );
    expect(
      buildHatenaBlogPublicFeedUrl('https://example.com/blog/', 'atom'),
    ).toBe('https://example.com/blog/feed');
    expect(
      buildHatenaBlogPublicFeedUrl('https://staff.hatenablog.com/rss'),
    ).toBe('https://staff.hatenablog.com/rss');
  });

  it('fetchHatenaBlogPublicFeed と hatena.blog.getPublicFeed が公開フィードを取得できること', async () => {
    const rssXml = `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0">
  <channel>
    <title>テストブログ</title>
    <link>https://taro.hatenablog.com/</link>
    <item>
      <title>記事1</title>
      <link>https://taro.hatenablog.com/entry/1</link>
      <description>説明</description>
    </item>
  </channel>
</rss>`;

    const fetchMock = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response(rssXml, { status: 200 }))
      .mockResolvedValueOnce(new Response(rssXml, { status: 200 }));

    const direct = await fetchHatenaBlogPublicFeed('staff.hatenablog.com', {
      fetch: fetchMock,
    });
    expect(direct.title).toBe('テストブログ');
    expect(direct.items).toHaveLength(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://staff.hatenablog.com/rss',
    );

    const client = createClient(fetchMock);
    await client.blog.getPublicFeed({ format: 'atom' });
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      'https://taro.hatenablog.com/feed',
    );
  });
});
