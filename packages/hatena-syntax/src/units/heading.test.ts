import { describe, expect, it } from 'vitest';
import {
  hatenaHeadingToHtml,
  hatenaHeadingToMarkdown,
  htmlHeadingToHatena,
  htmlHeadingToMarkdown,
  markdownHeadingToHatena,
  markdownHeadingToHtml,
} from './heading.js';

describe('heading unit converters', () => {
  it('はてな見出し ↔ HTML ↔ Markdown の双方向変換ができること', () => {
    expect(hatenaHeadingToHtml('* 大見出し')).toBe('<h1>大見出し</h1>');
    expect(hatenaHeadingToMarkdown('** 中見出し')).toBe('## 中見出し');
    expect(htmlHeadingToMarkdown('<h2>中見出し</h2>')).toBe('## 中見出し');
    expect(htmlHeadingToHatena('<h3>小見出し</h3>')).toBe('*** 小見出し');
    expect(markdownHeadingToHtml('## タイトル & サブ')).toBe(
      '<h2>タイトル &amp; サブ</h2>',
    );
    expect(markdownHeadingToHatena('### サブセクション')).toBe(
      '*** サブセクション',
    );
  });

  it('levelOffset と minLevel / maxLevel が機能すること', () => {
    expect(hatenaHeadingToHtml('* 見出し', { levelOffset: 2 })).toBe(
      '<h3>見出し</h3>',
    );
    expect(htmlHeadingToHatena('<h3>見出し</h3>', { levelOffset: -2 })).toBe(
      '* 見出し',
    );
    expect(htmlHeadingToHatena('<h6>深い見出し</h6>', { maxLevel: 3 })).toBe(
      '*** 深い見出し',
    );
  });
});
