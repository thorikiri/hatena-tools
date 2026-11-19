import { describe, expect, it, vi } from 'vitest';
import { HatenaClient } from '../client.js';
import { HatenaApiError } from '../errors.js';
import { resolveFotolifeEditUrl } from './fotolife.js';

const UPLOAD_RESPONSE_XML = `<?xml version="1.0" encoding="utf-8"?>
<entry xmlns="http://purl.org/atom/ns#" xmlns:hatena="http://www.hatena.ne.jp/info/xmlns#">
  <title>sunset.jpg</title>
  <link rel="service.edit" type="application/x.atom+xml" href="https://f.hatena.ne.jp/atom/edit/20261119123456" />
  <issued>2026-11-19T12:34:56+09:00</issued>
  <hatena:imageurl>https://cdn-ak.f.st-hatena.com/images/fotolife/t/taro/20261119/20261119123456.jpg</hatena:imageurl>
  <hatena:syntax>f:id:taro:20261119123456j:image</hatena:syntax>
</entry>`;

const FEED_RESPONSE_XML = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://purl.org/atom/ns#" xmlns:hatena="http://www.hatena.ne.jp/info/xmlns#">
  <author>
    <name>taro</name>
  </author>
  ${UPLOAD_RESPONSE_XML.replace('<?xml version="1.0" encoding="utf-8"?>', '')}
</feed>`;

describe('resolveFotolifeEditUrl', () => {
  it('文字列（photoId / editUrl / syntax / imageUrl）を自動判別して Edit URI を返すこと', () => {
    const expected = 'https://f.hatena.ne.jp/atom/edit/20261119123456';

    expect(resolveFotolifeEditUrl('20261119123456')).toBe(expected);
    expect(resolveFotolifeEditUrl(expected)).toBe(expected);
    expect(resolveFotolifeEditUrl('f:id:taro:20261119123456j:image')).toBe(
      expected,
    );
    expect(
      resolveFotolifeEditUrl(
        'https://cdn-ak.f.st-hatena.com/images/fotolife/t/taro/20261119/20261119123456.jpg',
      ),
    ).toBe(expected);
  });

  it('オブジェクト指定で優先度通りに Edit URI を解決すること', () => {
    expect(
      resolveFotolifeEditUrl({
        editUrl: 'https://f.hatena.ne.jp/atom/edit/11111111111111',
        syntax: 'f:id:taro:22222222222222j:image',
      }),
    ).toBe('https://f.hatena.ne.jp/atom/edit/11111111111111');

    expect(
      resolveFotolifeEditUrl({
        syntax: 'f:id:taro:22222222222222j:image',
      }),
    ).toBe('https://f.hatena.ne.jp/atom/edit/22222222222222');

    expect(
      resolveFotolifeEditUrl({
        imageUrl:
          'https://cdn-ak.f.st-hatena.com/images/fotolife/t/taro/20261119/20261119123456.png',
      }),
    ).toBe('https://f.hatena.ne.jp/atom/edit/20261119123456');
  });

  it('許可されていないホストの editUrl を拒否すること', () => {
    expect(() =>
      resolveFotolifeEditUrl('https://evil.example.com/atom/edit/123'),
    ).toThrowError(HatenaApiError);
    expect(() => resolveFotolifeEditUrl('invalid-target')).toThrowError(
      HatenaApiError,
    );
  });
});

describe('HatenaFotolifeClient', () => {
  const createClient = (fetchMock: typeof globalThis.fetch) =>
    new HatenaClient({
      auth: {
        type: 'oauth1',
        consumerKey: 'ck',
        consumerSecret: 'cs',
        accessToken: 'at',
        accessSecret: 'as',
      },
      fetch: fetchMock,
    });

  it('upload が Base64 Atom XML を POST して結果を返すこと', async () => {
    const fetchMock = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(new Response(UPLOAD_RESPONSE_XML, { status: 201 }));

    const client = createClient(fetchMock);
    const result = await client.fotolife.upload({
      file: new Uint8Array([1, 2, 3]),
      title: 'sunset.jpg',
      contentType: 'image/jpeg',
      folder: 'Blog',
    });

    expect(result).toMatchObject({
      photoId: '20261119123456',
      title: 'sunset.jpg',
      syntax: 'f:id:taro:20261119123456j:image',
      editUrl: 'https://f.hatena.ne.jp/atom/edit/20261119123456',
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://f.hatena.ne.jp/atom/post',
    );
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('POST');
  });

  it('getPhotos が写真一覧フィードを取得すること', async () => {
    const fetchMock = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(new Response(FEED_RESPONSE_XML, { status: 200 }));

    const client = createClient(fetchMock);
    const feed = await client.fotolife.getPhotos();

    expect(feed.hatenaUser).toBe('taro');
    expect(feed.photos).toHaveLength(1);
    expect(feed.photos[0]?.photoId).toBe('20261119123456');
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://f.hatena.ne.jp/atom/feed',
    );
  });

  it('deletePhoto が文字列・オブジェクト両方で DELETE リクエストを送信すること', async () => {
    const fetchMock = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));

    const client = createClient(fetchMock);

    await client.fotolife.deletePhoto('f:id:taro:20261119123456j:image');
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://f.hatena.ne.jp/atom/edit/20261119123456',
    );
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('DELETE');

    await client.fotolife.deletePhoto({ photoId: '20261119999999' });
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      'https://f.hatena.ne.jp/atom/edit/20261119999999',
    );
    expect(fetchMock.mock.calls[1]?.[1]?.method).toBe('DELETE');
  });

  it('getPhoto で単一写真情報を取得できること', async () => {
    const fetchMock = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(new Response(UPLOAD_RESPONSE_XML, { status: 200 }));

    const client = createClient(fetchMock);
    const photo = await client.fotolife.getPhoto('20261119123456');

    expect(photo.photoId).toBe('20261119123456');
    expect(photo.title).toBe('sunset.jpg');
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://f.hatena.ne.jp/atom/edit/20261119123456',
    );
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('GET');
  });

  it('updatePhoto で写真のタイトルを更新できること', async () => {
    const fetchMock = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(new Response(null, { status: 200 }));

    const client = createClient(fetchMock);
    await client.fotolife.updatePhoto('f:id:taro:20261119123456j:image', {
      title: '新しいタイトル',
    });

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('https://f.hatena.ne.jp/atom/edit/20261119123456');
    expect(init?.method).toBe('PUT');
    expect(init?.body).toContain('<title>新しいタイトル</title>');
  });
});
