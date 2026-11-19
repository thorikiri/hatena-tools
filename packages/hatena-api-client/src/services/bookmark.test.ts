import { describe, expect, it, vi } from 'vitest';
import { HatenaClient } from '../client.js';
import { HatenaApiError } from '../errors.js';
import {
  fetchHatenaBookmarkCommentOEmbed,
  fetchHatenaBookmarkCount,
  fetchHatenaBookmarkCounts,
  fetchHatenaBookmarkEntryInfo,
} from './bookmark.js';

const SAMPLE_RSS_XML = `<?xml version="1.0" encoding="utf-8"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/">
  <item rdf:about="https://example.com/post">
    <title>サンプル記事</title>
    <link>https://example.com/post</link>
    <description>コメント</description>
  </item>
</rdf:RDF>`;

describe('HatenaBookmarkClient', () => {
  const createClient = (fetchMock: typeof globalThis.fetch) =>
    new HatenaClient({
      auth: {
        type: 'oauth1',
        consumerKey: 'ck',
        consumerSecret: 'cs',
        accessToken: 'at',
        accessSecret: 'as',
      },
      hatenaId: 'taro',
      fetch: fetchMock,
    });

  it('get でブックマーク取得および 404 時 null 返却ができること', async () => {
    const fetchMock = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            url: 'https://example.com',
            comment: 'nice',
            tags: ['tech'],
            eid: '123',
            created_datetime: '2026-11-19T12:00:00+09:00',
            permalink: 'https://b.hatena.ne.jp/entry/s/example.com',
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response('Not Found', { status: 404 }));

    const client = createClient(fetchMock);

    const found = await client.bookmark.get({ url: 'https://example.com' });
    expect(found).toEqual({
      url: 'https://example.com',
      comment: 'nice',
      tags: ['tech'],
      eid: '123',
      createdDatetime: '2026-11-19T12:00:00+09:00',
      permalink: 'https://b.hatena.ne.jp/entry/s/example.com',
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://bookmark.hatenaapis.com/rest/1/my/bookmark?url=https%3A%2F%2Fexample.com',
    );

    const missing = await client.bookmark.get({
      url: 'https://example.com/none',
    });
    expect(missing).toBeNull();
  });

  it('add でタグを正規化・上限10件にして POST 送信すること', async () => {
    const fetchMock = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          url: 'https://example.com',
          comment: 'hello',
          tags: ['t1', 't2'],
        }),
        { status: 200 },
      ),
    );

    const client = createClient(fetchMock);
    const result = await client.bookmark.add({
      url: 'https://example.com',
      comment: '  hello  ',
      tags: [
        ' t1 ',
        't2',
        't1',
        '',
        't3',
        't4',
        't5',
        't6',
        't7',
        't8',
        't9',
        't10',
        't11',
      ],
    });

    expect(result.comment).toBe('hello');
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('https://bookmark.hatenaapis.com/rest/1/my/bookmark');
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe(
      'url=https%3A%2F%2Fexample.com&comment=hello&tags=t1&tags=t2&tags=t3&tags=t4&tags=t5&tags=t6&tags=t7&tags=t8&tags=t9&tags=t10',
    );
  });

  it('delete が 204 および 404 で正常終了すること', async () => {
    const fetchMock = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response('Not Found', { status: 404 }));

    const client = createClient(fetchMock);

    await expect(
      client.bookmark.delete({ url: 'https://example.com' }),
    ).resolves.toBeUndefined();
    await expect(
      client.bookmark.delete({ url: 'https://example.com' }),
    ).resolves.toBeUndefined();
  });

  it('getTags でユーザーのタグ一覧を取得できること', async () => {
    const fetchMock = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          tags: [
            { tag: 'TypeScript', count: 15 },
            { tag: 'AI', count: 8 },
          ],
        }),
        { status: 200 },
      ),
    );

    const client = createClient(fetchMock);
    const tags = await client.bookmark.getTags();
    expect(tags).toEqual([
      { tag: 'TypeScript', count: 15 },
      { tag: 'AI', count: 8 },
    ]);
  });

  it('getMyFeed と getHotEntries が公開 RSS を取得・パースすること', async () => {
    const fetchMock = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response(SAMPLE_RSS_XML, { status: 200 }))
      .mockResolvedValueOnce(new Response(SAMPLE_RSS_XML, { status: 200 }))
      .mockResolvedValueOnce(new Response(SAMPLE_RSS_XML, { status: 200 }));

    const client = createClient(fetchMock);

    const myFeed = await client.bookmark.getMyFeed();
    expect(myFeed).toHaveLength(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://b.hatena.ne.jp/taro/rss',
    );

    await client.bookmark.getHotEntries();
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      'https://b.hatena.ne.jp/hotentry.rss',
    );

    await client.bookmark.getHotEntries({ category: 'it' });
    expect(fetchMock.mock.calls[2]?.[0]).toBe(
      'https://b.hatena.ne.jp/hotentry/it.rss',
    );
  });

  it('hatenaId 未指定の getMyFeed で HatenaApiError をスローすること', async () => {
    const client = new HatenaClient({
      auth: {
        type: 'oauth1',
        consumerKey: 'ck',
        consumerSecret: 'cs',
        accessToken: 'at',
        accessSecret: 'as',
      },
    });

    await expect(client.bookmark.getMyFeed()).rejects.toBeInstanceOf(
      HatenaApiError,
    );
  });

  it('add で private と共有オプションを送信しレスポンスの拡張フィールドを受け取れること', async () => {
    const fetchMock = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          url: 'https://example.com',
          comment: 'secret',
          tags: [],
          user: 'taro',
          private: 1,
          created_epoch: 1700000000,
        }),
        { status: 200 },
      ),
    );

    const client = createClient(fetchMock);
    const result = await client.bookmark.add({
      url: 'https://example.com',
      comment: 'secret',
      private: true,
      postTwitter: true,
    });

    expect(result).toMatchObject({
      user: 'taro',
      private: true,
      createdEpoch: 1700000000,
    });
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(
      'url=https%3A%2F%2Fexample.com&comment=secret&private=1&post_twitter=1',
    );
  });

  it('getEntry でエントリー情報を取得し 404 時は null を返すこと', async () => {
    const fetchMock = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            title: 'Sample Page',
            url: 'https://example.com',
            entry_url: 'https://b.hatena.ne.jp/entry/s/example.com',
            count: '42',
            favicon_url: 'https://example.com/favicon.ico',
            smartphone_app_entry_url:
              'https://b.hatena.ne.jp/entry/s/example.com',
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response('Not Found', { status: 404 }));

    const client = createClient(fetchMock);

    const entry = await client.bookmark.getEntry({
      url: 'https://example.com',
    });
    expect(entry).toEqual({
      title: 'Sample Page',
      url: 'https://example.com',
      entryUrl: 'https://b.hatena.ne.jp/entry/s/example.com',
      count: 42,
      faviconUrl: 'https://example.com/favicon.ico',
      smartphoneAppEntryUrl: 'https://b.hatena.ne.jp/entry/s/example.com',
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://bookmark.hatenaapis.com/rest/1/entry?url=https%3A%2F%2Fexample.com',
    );

    expect(
      await client.bookmark.getEntry({ url: 'https://example.com/none' }),
    ).toBeNull();
  });

  it('getMyInfo でユーザー設定情報を取得できること', async () => {
    const fetchMock = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          name: 'taro',
          plususer: 1,
          private: '0',
          is_oauth_twitter: 1,
          is_oauth_evernote: null,
          is_oauth_facebook: 0,
          is_oauth_mixi_check: '0',
        }),
        { status: 200 },
      ),
    );

    const client = createClient(fetchMock);
    const info = await client.bookmark.getMyInfo();

    expect(info).toEqual({
      name: 'taro',
      plususer: true,
      private: false,
      isOAuthTwitter: true,
      isOAuthEvernote: false,
      isOAuthFacebook: false,
      isOAuthMixiCheck: false,
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://bookmark.hatenaapis.com/rest/1/my',
    );
  });

  it('getCount と getCounts でブックマーク件数を取得できること（50件上限チェック含む）', async () => {
    const fetchMock = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response('1303', { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            'https://a.example.com': 10,
            'https://b.example.com': 20,
          }),
          { status: 200 },
        ),
      );

    expect(
      await fetchHatenaBookmarkCount('https://hatena.blog/', {
        fetch: fetchMock,
      }),
    ).toBe(1303);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://bookmark.hatenaapis.com/count/entry?url=https%3A%2F%2Fhatena.blog%2F',
    );

    const client = createClient(fetchMock);
    expect(
      await client.bookmark.getCounts({
        urls: ['https://a.example.com', 'https://b.example.com'],
      }),
    ).toEqual({
      'https://a.example.com': 10,
      'https://b.example.com': 20,
    });
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      'https://bookmark.hatenaapis.com/count/entries?url=https%3A%2F%2Fa.example.com&url=https%3A%2F%2Fb.example.com',
    );

    const tooMany = Array.from(
      { length: 51 },
      (_, i) => `https://example.com/${i}`,
    );
    await expect(
      fetchHatenaBookmarkCounts(tooMany, { fetch: fetchMock }),
    ).rejects.toBeInstanceOf(HatenaApiError);
  });

  it('getPublicEntry でエントリー情報（#エスケープ・lite・null返却）を取得できること', async () => {
    const fetchMock = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            title: 'Title',
            count: 5,
            url: 'https://example.com/#sec',
            entry_url: 'https://b.hatena.ne.jp/entry/s/example.com/#sec',
            screenshot: 'https://b.hatena.ne.jp/screenshot.png',
            eid: '999',
            bookmarks: [
              {
                user: 'taro',
                tags: ['tech'],
                timestamp: '2026/11/19 10:00',
                comment: 'good',
              },
            ],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response('null', { status: 200 }));

    const entry = await fetchHatenaBookmarkEntryInfo(
      'https://example.com/#sec',
      { lite: true, fetch: fetchMock },
    );
    expect(entry).toMatchObject({
      title: 'Title',
      count: 5,
      eid: '999',
      bookmarks: [
        {
          user: 'taro',
          tags: ['tech'],
          timestamp: '2026/11/19 10:00',
          comment: 'good',
        },
      ],
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://b.hatena.ne.jp/entry/jsonlite/https://example.com/%23sec',
    );

    const client = createClient(fetchMock);
    expect(
      await client.bookmark.getPublicEntry({ url: 'https://example.com/none' }),
    ).toBeNull();
  });

  it('searchMyBookmarks で全文検索できること', async () => {
    const fetchMock = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          meta: { query: 'TypeScript', total: 1, elapsed: 0.01, status: 200 },
          bookmarks: [
            {
              title: 'TS',
              url: 'https://example.com',
              count: 10,
              eid: '1',
              comment: 'memo',
              tags: ['ts'],
              timestamp: 1700000000,
            },
          ],
        }),
        { status: 200 },
      ),
    );

    const client = createClient(fetchMock);
    const res = await client.bookmark.searchMyBookmarks({
      q: 'TypeScript',
      of: 10,
      limit: 20,
    });

    expect(res.meta.total).toBe(1);
    expect(res.bookmarks).toHaveLength(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://b.hatena.ne.jp/my/search/json?q=TypeScript&of=10&limit=20',
    );
  });

  it('getCommentOEmbed でコメント oEmbed 情報を取得できること', async () => {
    const fetchMock = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          version: '1.0',
          type: 'rich',
          title: 'comment title',
          url: 'https://b.hatena.ne.jp/entry/40863/comment/sample',
          html: '<blockquote>...</blockquote>',
          width: '100%',
          height: '160px',
          author_name: 'sample',
          author_url: 'https://b.hatena.ne.jp/sample/',
          provider_name: 'Hatena Bookmark',
          provider_url: 'https://b.hatena.ne.jp/',
        }),
        { status: 200 },
      ),
    );

    const oembed = await fetchHatenaBookmarkCommentOEmbed(
      'https://b.hatena.ne.jp/entry/40863/comment/sample',
      { fetch: fetchMock },
    );
    expect(oembed.authorName).toBe('sample');
    expect(oembed.html).toBe('<blockquote>...</blockquote>');
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://b.hatena.ne.jp/api/oembed?url=https%3A%2F%2Fb.hatena.ne.jp%2Fentry%2F40863%2Fcomment%2Fsample&format=json',
    );
  });

  it('getMyFeed のクエリパラメータと getFavoriteFeed が動作すること', async () => {
    const fetchMock = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response(SAMPLE_RSS_XML, { status: 200 }))
      .mockResolvedValueOnce(new Response(SAMPLE_RSS_XML, { status: 200 }));

    const client = createClient(fetchMock);

    await client.bookmark.getMyFeed({
      page: 2,
      tag: 'TypeScript',
      q: 'vitest',
      date: '20261119',
      url: 'https://example.com',
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://b.hatena.ne.jp/taro/rss?page=2&tag=TypeScript&q=vitest&date=20261119&url=https%3A%2F%2Fexample.com',
    );

    const fav = await client.bookmark.getFavoriteFeed({ key: 'secret-key' });
    expect(fav).toHaveLength(1);
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      'https://b.hatena.ne.jp/taro/favorite.rss?key=secret-key',
    );
  });
});
