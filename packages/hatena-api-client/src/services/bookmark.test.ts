import { describe, expect, it, vi } from 'vitest';
import { HatenaClient } from '../client.js';
import { HatenaApiError } from '../errors.js';

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
});
