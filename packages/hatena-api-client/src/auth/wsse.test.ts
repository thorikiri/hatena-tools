import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildWsseHeader } from './wsse.js';

describe('buildWsseHeader', () => {
  it('WSSE 仕様に準拠した X-WSSE ヘッダーを生成すること', async () => {
    const nonceBytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const created = '2026-11-19T09:00:00Z';
    const hatenaId = 'test_user';
    const apiKey = 'secret_api_key';

    const header = await buildWsseHeader(hatenaId, apiKey, {
      nonce: nonceBytes,
      created,
    });

    const expectedNonce = Buffer.from(nonceBytes).toString('base64');
    const expectedDigest = crypto
      .createHash('sha1')
      .update(
        Buffer.concat([
          Buffer.from(nonceBytes),
          Buffer.from(`${created}${apiKey}`),
        ]),
      )
      .digest('base64');

    expect(header).toBe(
      `UsernameToken Username="${hatenaId}", PasswordDigest="${expectedDigest}", Nonce="${expectedNonce}", Created="${created}"`,
    );
  });
});
