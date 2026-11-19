import crypto from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { HatenaApiError } from '../errors.js';
import {
  buildOAuth1AuthorizationHeader,
  HatenaOAuth1,
  percentEncode,
  serializeFormParams,
} from './oauth1.js';

describe('percentEncode', () => {
  it('RFC 5849 の予約外文字以外をパーセントエンコードすること', () => {
    expect(percentEncode("abc123-._~ !'()*")).toBe(
      'abc123-._~%20%21%27%28%29%2A',
    );
  });
});

describe('serializeFormParams', () => {
  it('単一値と配列パラメータを直列化すること', () => {
    expect(
      serializeFormParams({
        url: 'https://example.com',
        tags: ['tech', 'blog'],
      }),
    ).toBe('url=https%3A%2F%2Fexample.com&tags=tech&tags=blog');
  });
});

describe('buildOAuth1AuthorizationHeader', () => {
  it('HMAC-SHA1 署名が node:crypto の計算結果と一致すること', async () => {
    const header = await buildOAuth1AuthorizationHeader({
      url: 'https://bookmark.hatenaapis.com/rest/1/my/bookmark?url=https%3A%2F%2Fexample.com',
      method: 'POST',
      consumerKey: 'dpf43f3p2l4k3l03',
      consumerSecret: 'kd94hf93k423kf44',
      token: 'nnch734d00sl2jdk',
      tokenSecret: 'pfkkdhi9sl3r4s00',
      formParams: {
        tags: ['b', 'a'],
      },
      nonce: 'kllo9940pd9333jh',
      timestamp: '1191242096',
    });

    // 手動で署名ベース文字列を組み立てて node:crypto で検証
    const pairs: Array<[string, string]> = [
      ['oauth_consumer_key', 'dpf43f3p2l4k3l03'],
      ['oauth_nonce', 'kllo9940pd9333jh'],
      ['oauth_signature_method', 'HMAC-SHA1'],
      ['oauth_timestamp', '1191242096'],
      ['oauth_token', 'nnch734d00sl2jdk'],
      ['oauth_version', '1.0'],
      ['tags', 'a'],
      ['tags', 'b'],
      ['url', percentEncode('https://example.com')],
    ];
    pairs.sort((a, b) =>
      a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : 1,
    );
    const normalized = pairs.map(([k, v]) => `${k}=${v}`).join('&');
    const baseString = `POST&${percentEncode('https://bookmark.hatenaapis.com/rest/1/my/bookmark')}&${percentEncode(normalized)}`;
    const expectedSig = crypto
      .createHmac('sha1', 'kd94hf93k423kf44&pfkkdhi9sl3r4s00')
      .update(baseString)
      .digest('base64');

    expect(header).toContain(`oauth_signature="${percentEncode(expectedSig)}"`);
    expect(header.startsWith('OAuth ')).toBe(true);
  });
});

describe('HatenaOAuth1', () => {
  it('getRequestToken で Request Token と認可URLを取得できること', async () => {
    const fetchMock = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(
        new Response(
          'oauth_token=req-token&oauth_token_secret=req-secret&oauth_callback_confirmed=true',
          { status: 200 },
        ),
      );

    const oauth = new HatenaOAuth1({
      consumerKey: 'ck',
      consumerSecret: 'cs',
      fetch: fetchMock,
    });

    const result = await oauth.getRequestToken({
      callbackUrl: 'https://app.example.com/callback',
      scope: ['read_public', 'write_public'],
    });

    expect(result).toEqual({
      token: 'req-token',
      secret: 'req-secret',
      callbackConfirmed: true,
      authorizeUrl:
        'https://www.hatena.ne.jp/oauth/authorize?oauth_token=req-token',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const firstCall = fetchMock.mock.calls[0];
    expect(firstCall).toBeDefined();
    const [url, init] = firstCall ?? [];
    expect(url).toBe('https://www.hatena.com/oauth/initiate');
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe('scope=read_public%2Cwrite_public');
  });

  it('getAccessToken で Access Token とユーザー情報を取得できること', async () => {
    const fetchMock = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(
        new Response(
          'oauth_token=acc-token&oauth_token_secret=acc-secret&url_name=taro&display_name=Taro',
          { status: 200 },
        ),
      );

    const oauth = new HatenaOAuth1({
      consumerKey: 'ck',
      consumerSecret: 'cs',
      fetch: fetchMock,
    });

    const result = await oauth.getAccessToken({
      token: 'req-token',
      secret: 'req-secret',
      verifier: 'ver123',
    });

    expect(result).toEqual({
      accessToken: 'acc-token',
      accessSecret: 'acc-secret',
      urlName: 'taro',
      displayName: 'Taro',
    });
  });

  it('HTTP エラー時に HatenaApiError をスローすること', async () => {
    const fetchMock = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(new Response('Unauthorized', { status: 401 }));

    const oauth = new HatenaOAuth1({
      consumerKey: 'ck',
      consumerSecret: 'cs',
      fetch: fetchMock,
    });

    await expect(
      oauth.getRequestToken({ callbackUrl: 'https://app.example.com/cb' }),
    ).rejects.toMatchObject({
      name: 'HatenaApiError',
      code: 'UNAUTHORIZED',
      status: 401,
    });
  });

  it('タイムアウト時に HatenaApiError(TIMEOUT) をスローすること', async () => {
    const timeoutErr = new DOMException(
      'The operation was aborted due to timeout',
      'TimeoutError',
    );
    const fetchMock = vi
      .fn<typeof globalThis.fetch>()
      .mockRejectedValue(timeoutErr);

    const oauth = new HatenaOAuth1({
      consumerKey: 'ck',
      consumerSecret: 'cs',
      fetch: fetchMock,
    });

    try {
      await oauth.getRequestToken({
        callbackUrl: 'https://app.example.com/cb',
      });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(HatenaApiError);
      expect((error as HatenaApiError).code).toBe('TIMEOUT');
    }
  });
});
