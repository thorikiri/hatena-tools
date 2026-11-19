import { describe, expect, it, vi } from 'vitest';
import { HatenaClient } from '../client.js';
import { HatenaApiError } from '../errors.js';

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
});
