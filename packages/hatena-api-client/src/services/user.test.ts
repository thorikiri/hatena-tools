import { describe, expect, it, vi } from 'vitest';
import { HatenaClient } from '../client.js';
import { HatenaApiError } from '../errors.js';
import { getHatenaProfileImageUrl } from './user.js';

describe('getHatenaProfileImageUrl', () => {
  it('サイズに応じたプロフィール画像 URL を生成すること', () => {
    expect(getHatenaProfileImageUrl('jkondo')).toBe(
      'https://cdn.profile-image.st-hatena.com/users/jkondo/profile.png',
    );
    expect(getHatenaProfileImageUrl('jkondo', 64)).toBe(
      'https://cdn.profile-image.st-hatena.com/users/jkondo/profile.png',
    );
    expect(getHatenaProfileImageUrl('jkondo', 128)).toBe(
      'https://cdn.profile-image.st-hatena.com/users/jkondo/profile_128x128.png',
    );
    expect(getHatenaProfileImageUrl('jkondo', 256)).toBe(
      'https://cdn.profile-image.st-hatena.com/users/jkondo/profile_256x256.png',
    );
    expect(getHatenaProfileImageUrl('jkondo', 512)).toBe(
      'https://cdn.profile-image.st-hatena.com/users/jkondo/profile_512x512.png',
    );
  });

  it('空文字の hatenaId を拒否すること', () => {
    expect(() => getHatenaProfileImageUrl('   ')).toThrowError(HatenaApiError);
  });
});

describe('HatenaUserClient profile image', () => {
  it('デフォルトの hatenaId と引数指定の両方で URL を取得できること', () => {
    const client = new HatenaClient({
      auth: { type: 'wsse', hatenaId: 'taro', apiKey: 'key' },
    });

    expect(client.user.getProfileImageUrl()).toBe(
      'https://cdn.profile-image.st-hatena.com/users/taro/profile.png',
    );
    expect(client.user.getProfileImageUrl({ size: 256 })).toBe(
      'https://cdn.profile-image.st-hatena.com/users/taro/profile_256x256.png',
    );
    expect(
      client.user.getProfileImageUrl({ hatenaId: 'jkondo', size: 128 }),
    ).toBe(
      'https://cdn.profile-image.st-hatena.com/users/jkondo/profile_128x128.png',
    );
  });

  it('hatenaId 未指定の場合は HatenaApiError をスローすること', () => {
    const client = new HatenaClient({
      auth: {
        type: 'oauth1',
        consumerKey: 'ck',
        consumerSecret: 'cs',
        accessToken: 'at',
        accessSecret: 'as',
      },
    });

    expect(() => client.user.getProfileImageUrl()).toThrowError(HatenaApiError);
  });

  it('fetchProfileImage で画像バイナリとメタ情報を取得できること', async () => {
    const pngBytes = new Uint8Array([137, 80, 78, 71]);
    const fetchMock = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(pngBytes, {
        status: 200,
        headers: { 'Content-Type': 'image/png' },
      }),
    );

    const client = new HatenaClient({
      auth: { type: 'wsse', hatenaId: 'taro', apiKey: 'key' },
      fetch: fetchMock,
    });

    const result = await client.user.fetchProfileImage({ size: 512 });

    expect(result.url).toBe(
      'https://cdn.profile-image.st-hatena.com/users/taro/profile_512x512.png',
    );
    expect(result.contentType).toBe('image/png');
    expect(result.data).toEqual(pngBytes);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fetchProfileImage で 404 やタイムアウト時に HatenaApiError をスローすること', async () => {
    const fetchMock = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response('Not Found', { status: 404 }))
      .mockRejectedValueOnce(new DOMException('Timeout', 'TimeoutError'));

    const client = new HatenaClient({
      auth: { type: 'wsse', hatenaId: 'taro', apiKey: 'key' },
      fetch: fetchMock,
    });

    await expect(client.user.fetchProfileImage()).rejects.toMatchObject({
      name: 'HatenaApiError',
      code: 'NOT_FOUND',
      status: 404,
    });

    await expect(client.user.fetchProfileImage()).rejects.toMatchObject({
      name: 'HatenaApiError',
      code: 'TIMEOUT',
    });
  });
});
