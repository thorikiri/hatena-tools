import { describe, expect, it, vi } from 'vitest';
import { HatenaClient } from '../client.js';
import { HatenaApiError } from '../errors.js';
import {
  computeBackoffDelayMs,
  parseRetryAfterMs,
  shouldRetryStatus,
} from './retry.js';

describe('retry helpers', () => {
  it('shouldRetryStatus が 429 と 5xx のみ true を返すこと', () => {
    expect(shouldRetryStatus(429)).toBe(true);
    expect(shouldRetryStatus(500)).toBe(true);
    expect(shouldRetryStatus(503)).toBe(true);
    expect(shouldRetryStatus(400)).toBe(false);
    expect(shouldRetryStatus(401)).toBe(false);
    expect(shouldRetryStatus(404)).toBe(false);
  });

  it('parseRetryAfterMs が秒数と HTTP-date をミリ秒に変換すること', () => {
    expect(parseRetryAfterMs('3')).toBe(3000);
    expect(parseRetryAfterMs(null)).toBeNull();

    const futureDate = new Date(Date.now() + 5000).toUTCString();
    const parsed = parseRetryAfterMs(futureDate);
    expect(parsed).not.toBeNull();
    expect(parsed).toBeGreaterThanOrEqual(3000);
    expect(parsed).toBeLessThanOrEqual(6000);
  });

  it('computeBackoffDelayMs が Retry-After を maxDelayMs 上限付きで優先すること', () => {
    const delay = computeBackoffDelayMs(
      0,
      { maxRetries: 3, baseDelayMs: 500, maxDelayMs: 2000 },
      '10',
    );
    expect(delay).toBe(2000);
  });
});

describe('HatenaFetchClient retry', () => {
  it('429 や 503 の後にリトライして 200 で成功すること', async () => {
    const fetchMock = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(
        new Response('Too Many Requests', {
          status: 429,
          headers: { 'Retry-After': '0' },
        }),
      )
      .mockResolvedValueOnce(
        new Response('Service Unavailable', { status: 503 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ url_name: 'taro', display_name: 'Taro' }),
          {
            status: 200,
          },
        ),
      );

    const client = new HatenaClient({
      auth: { type: 'wsse', hatenaId: 'taro', apiKey: 'key' },
      retry: { maxRetries: 3, baseDelayMs: 1, maxDelayMs: 10 },
      fetch: fetchMock,
    });

    const me = await client.user.getMe();
    expect(me).toEqual({ urlName: 'taro', displayName: 'Taro' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('ネットワークエラー時にリトライし、上限超過で HatenaApiError をスローすること', async () => {
    const fetchMock = vi
      .fn<typeof globalThis.fetch>()
      .mockRejectedValue(new TypeError('fetch failed'));

    const client = new HatenaClient({
      auth: { type: 'wsse', hatenaId: 'taro', apiKey: 'key' },
      retry: { maxRetries: 2, baseDelayMs: 1, maxDelayMs: 5 },
      fetch: fetchMock,
    });

    await expect(client.user.getMe()).rejects.toMatchObject({
      name: 'HatenaApiError',
      code: 'NETWORK_ERROR',
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('401 や 404 のクライアントエラーではリトライせず即座に失敗すること', async () => {
    const fetchMock = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(new Response('Unauthorized', { status: 401 }));

    const client = new HatenaClient({
      auth: { type: 'wsse', hatenaId: 'taro', apiKey: 'key' },
      retry: { maxRetries: 3, baseDelayMs: 1, maxDelayMs: 5 },
      fetch: fetchMock,
    });

    await expect(client.user.getMe()).rejects.toBeInstanceOf(HatenaApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('リクエスト単位で retry: false を指定して抑止できること', async () => {
    const fetchMock = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(new Response('Server Error', { status: 500 }));

    const client = new HatenaClient({
      auth: { type: 'wsse', hatenaId: 'taro', apiKey: 'key' },
      retry: { maxRetries: 3, baseDelayMs: 1, maxDelayMs: 5 },
      fetch: fetchMock,
    });

    await expect(
      client.request({
        url: 'https://n.hatena.com/applications/my.json',
        method: 'GET',
        retry: false,
      }),
    ).rejects.toMatchObject({
      code: 'API_ERROR',
      status: 500,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('外部 AbortSignal でキャンセルされた場合はリトライしないこと', async () => {
    const controller = new AbortController();
    const fetchMock = vi
      .fn<typeof globalThis.fetch>()
      .mockImplementation(async () => {
        controller.abort();
        throw new DOMException('Aborted', 'AbortError');
      });

    const client = new HatenaClient({
      auth: { type: 'wsse', hatenaId: 'taro', apiKey: 'key' },
      retry: { maxRetries: 3, baseDelayMs: 1, maxDelayMs: 5 },
      fetch: fetchMock,
    });

    await expect(
      client.request({
        url: 'https://n.hatena.com/applications/my.json',
        method: 'GET',
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({
      code: 'TIMEOUT',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
