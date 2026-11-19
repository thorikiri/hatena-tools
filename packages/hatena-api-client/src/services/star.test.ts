import { describe, expect, it, vi } from 'vitest';
import { HatenaClient } from '../client.js';
import { HatenaApiError } from '../errors.js';
import {
  fetchHatenaStarBlogCount,
  fetchHatenaStarCountImage,
  fetchHatenaStarEntries,
  getHatenaStarCountImageUrl,
  parseStarCountHeader,
} from './star.js';

describe('parseStarCountHeader', () => {
  it('X-Hatena-Star-Count ヘッダーを色別マップへパースすること', () => {
    expect(parseStarCountHeader('yellow=326, green=4, red=2')).toEqual({
      yellow: 326,
      green: 4,
      red: 2,
    });
    expect(parseStarCountHeader(null)).toEqual({});
  });
});

describe('getHatenaStarCountImageUrl', () => {
  it('オプションに応じたスター画像 URL を生成すること', () => {
    expect(
      getHatenaStarCountImageUrl({ uri: 'https://staff.hatenablog.com/' }),
    ).toBe(
      'https://s.st-hatena.com/entry.count.image?uri=https%3A%2F%2Fstaff.hatenablog.com%2F',
    );

    expect(
      getHatenaStarCountImageUrl({
        uri: 'https://staff.hatenablog.com/',
        bg: '#000000',
        large: true,
      }),
    ).toBe(
      'https://s.st-hatena.com/entry.count.image?uri=https%3A%2F%2Fstaff.hatenablog.com%2F&bg=%23000000&q=1',
    );
  });
});

describe('HatenaStarClient', () => {
  const createClient = (fetchMock: typeof globalThis.fetch) =>
    new HatenaClient({
      auth: { type: 'wsse', hatenaId: 'taro', apiKey: 'key' },
      fetch: fetchMock,
    });

  it('getBlogCount でブログ全体のスター数を取得できること（数値・文字列混在対応）', async () => {
    const fetchMock = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          title: 'はてなブログ開発ブログ',
          uri: 'https://staff.hatenablog.com/',
          star_count: '62508',
          count: { yellow: 62129, green: '337' },
        }),
        { status: 200 },
      ),
    );

    const client = createClient(fetchMock);
    const res = await client.star.getBlogCount({
      uri: 'https://staff.hatenablog.com/',
    });

    expect(res).toEqual({
      title: 'はてなブログ開発ブログ',
      uri: 'https://staff.hatenablog.com/',
      starCount: 62508,
      count: { yellow: 62129, green: 337 },
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://s.hatena.ne.jp/blog.json?uri=https%3A%2F%2Fstaff.hatenablog.com%2F',
    );

    await expect(
      fetchHatenaStarBlogCount('   ', { fetch: fetchMock }),
    ).rejects.toBeInstanceOf(HatenaApiError);
  });

  it('getEntries と getEntry でスター一覧を取得できること', async () => {
    const fetchMock = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          entries: [
            {
              uri: 'https://example.com/1',
              stars: [{ name: 'taro', quote: 'nice' }],
              colored_stars: [
                {
                  color: 'green',
                  stars: [{ name: 'jiro', quote: '', count: 2 }],
                },
              ],
            },
          ],
        }),
        { status: 200 },
      ),
    );

    const client = createClient(fetchMock);
    const entry = await client.star.getEntry({ uri: 'https://example.com/1' });

    expect(entry).toEqual({
      uri: 'https://example.com/1',
      stars: [{ name: 'taro', quote: 'nice', count: 1 }],
      coloredStars: [
        {
          color: 'green',
          stars: [{ name: 'jiro', quote: '', count: 2 }],
        },
      ],
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://s.hatena.com/entry.json?uri=https%3A%2F%2Fexample.com%2F1',
    );

    expect(await fetchHatenaStarEntries([], { fetch: fetchMock })).toEqual([]);
  });

  it('fetchCountImage で画像バイナリと X-Hatena-Star-Count を取得できること', async () => {
    const pngBytes = new Uint8Array([137, 80, 78, 71]);
    const fetchMock = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(pngBytes, {
        status: 200,
        headers: {
          'Content-Type': 'image/png',
          'X-Hatena-Star-Count': 'yellow=16, green=2',
        },
      }),
    );

    const result = await fetchHatenaStarCountImage(
      { uri: 'https://staff.hatenablog.com/' },
      { fetch: fetchMock },
    );

    expect(result).toEqual({
      url: 'https://s.st-hatena.com/entry.count.image?uri=https%3A%2F%2Fstaff.hatenablog.com%2F',
      contentType: 'image/png',
      data: pngBytes,
      starCounts: { yellow: 16, green: 2 },
    });
  });
});
