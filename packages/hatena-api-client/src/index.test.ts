import { describe, expect, it } from 'vitest';
import { PACKAGE_NAME } from './index.js';

describe('hatena-api-client', () => {
  it('パッケージ名が定義されていること', () => {
    expect(PACKAGE_NAME).toBe('@thorikiri/hatena-api-client');
  });
});
