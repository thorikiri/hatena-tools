import { describe, expect, it, vi } from 'vitest';
import { HatenaClient } from './client.js';
import { HatenaApiError } from './errors.js';

describe('HatenaClient', () => {
  it('OAuth 1.0a 認証で user.getMe() がユーザー情報を取得できること', async () => {
    const fetchMock = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          url_name: 'hatena_taro',
          display_name: 'はてな太郎',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const client = new HatenaClient({
      auth: {
        type: 'oauth1',
        consumerKey: 'ck',
        consumerSecret: 'cs',
        accessToken: 'at',
        accessSecret: 'as',
      },
      fetch: fetchMock,
    });

    const user = await client.user.getMe();
    expect(user).toEqual({
      urlName: 'hatena_taro',
      displayName: 'はてな太郎',
    });

    const firstCall = fetchMock.mock.calls[0];
    expect(firstCall).toBeDefined();
    const [url, init] = firstCall ?? [];
    expect(url).toBe('https://n.hatena.com/applications/my.json');
    expect(init?.method).toBe('GET');
    const headers = init?.headers as Record<string, string>;
    expect(headers.Authorization).toMatch(/^OAuth /);
  });

  it('WSSE 認証で X-WSSE ヘッダーを付与してリクエストすること', async () => {
    const fetchMock = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(new Response('ok', { status: 200 }));

    const client = new HatenaClient({
      auth: {
        type: 'wsse',
        hatenaId: 'taro',
        apiKey: 'api-key',
      },
      fetch: fetchMock,
    });

    const text = await client.requestText({
      url: 'https://blog.hatena.ne.jp/taro/taro.hatenablog.com/atom/entry',
      method: 'GET',
    });

    expect(text).toBe('ok');
    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Record<
      string,
      string
    >;
    expect(headers['X-WSSE']).toMatch(/^UsernameToken Username="taro"/);
  });

  it('HTTP ステータスに応じて適切な HatenaApiError コードに変換すること', async () => {
    const cases: Array<[number, string]> = [
      [401, 'UNAUTHORIZED'],
      [403, 'FORBIDDEN'],
      [404, 'NOT_FOUND'],
      [429, 'RATE_LIMITED'],
      [500, 'API_ERROR'],
    ];

    for (const [status, expectedCode] of cases) {
      const fetchMock = vi
        .fn<typeof globalThis.fetch>()
        .mockResolvedValue(new Response('error body', { status }));
      const client = new HatenaClient({
        auth: { type: 'wsse', hatenaId: 'taro', apiKey: 'key' },
        fetch: fetchMock,
      });

      try {
        await client.user.getMe();
        expect.unreachable();
      } catch (error) {
        expect(error).toBeInstanceOf(HatenaApiError);
        expect((error as HatenaApiError).code).toBe(expectedCode);
        expect((error as HatenaApiError).status).toBe(status);
        expect((error as HatenaApiError).responseBody).toBe('error body');
      }
    }
  });
});
