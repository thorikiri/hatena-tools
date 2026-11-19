import { describe, expect, it } from 'vitest';
import { PACKAGE_NAME } from './index.js';

describe('hatena-syntax', () => {
  it('パッケージ名が定義されていること', () => {
    expect(PACKAGE_NAME).toBe('@thorikiri/hatena-syntax');
  });
});
