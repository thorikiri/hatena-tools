import { describe, expect, it } from 'vitest';
import { HatenaApiError } from '../errors.js';
import { validateAllowedHatenaUrl } from './url-validator.js';

describe('validateAllowedHatenaUrl', () => {
  it('許可された HTTPS URL を返すこと', () => {
    const result = validateAllowedHatenaUrl(
      'https://blog.hatena.ne.jp/user/blog/atom/entry',
      ['blog.hatena.ne.jp'],
    );
    expect(result).toBe('https://blog.hatena.ne.jp/user/blog/atom/entry');
  });

  it('HTTP や許可されていないホスト、認証情報付き URL を拒否すること', () => {
    const invalidUrls = [
      'http://blog.hatena.ne.jp/user/blog/atom/entry',
      'https://evil.example.com/atom/entry',
      'https://user:pass@blog.hatena.ne.jp/atom/entry',
      'not-a-url',
    ];

    for (const url of invalidUrls) {
      expect(() =>
        validateAllowedHatenaUrl(url, ['blog.hatena.ne.jp']),
      ).toThrowError(HatenaApiError);
    }
  });
});
