import { describe, expect, it } from 'vitest';
import {
  hatenaLinkToHtml,
  hatenaLinkToMarkdown,
  hatenaQuoteToHtml,
  hatenaQuoteToMarkdown,
  markdownCodeToSuperPre,
  markdownQuoteToHatena,
  superPreToHtml,
  superPreToMarkdown,
  unescapeHatenaSyntax,
} from './blocks.js';

describe('blocks unit converters', () => {
  it('スーパーpre記法 ↔ Markdown / HTML 変換ができること', () => {
    const hatena = '>|ts|\nconst a = "<tag>";\n||<';
    const md = '```ts\nconst a = "<tag>";\n```';

    expect(superPreToMarkdown(hatena)).toBe(md);
    expect(markdownCodeToSuperPre(md)).toBe(hatena);
    expect(superPreToHtml(hatena)).toBe(
      '<pre><code class="language-ts">const a = &quot;&lt;tag&gt;&quot;;</code></pre>',
    );
  });

  it('引用記法 ↔ Markdown / HTML 変換ができること', () => {
    const hatena = '>https://example.com:title=出典サイト>\n引用行\n<<';
    expect(hatenaQuoteToMarkdown(hatena)).toBe(
      '> 引用行\n>\n> 出典: [出典サイト](https://example.com)',
    );
    expect(hatenaQuoteToHtml(hatena)).toContain(
      '<blockquote cite="https://example.com">',
    );
    expect(hatenaQuoteToHtml(hatena)).toContain(
      '<footer>出典: <a href="https://example.com">出典サイト</a></footer>',
    );
    expect(markdownQuoteToHatena('> 1行目\n> 2行目')).toBe(
      '>>\n1行目\n2行目\n<<',
    );
  });

  it('リンク記法を HTML / Markdown へ変換できること', () => {
    expect(hatenaLinkToHtml('[https://example.com:title=公式]')).toBe(
      '<a href="https://example.com">公式</a>',
    );
    expect(hatenaLinkToHtml('[https://example.com:embed]')).toContain(
      '<iframe src="https://hatenablog-parts.com/embed?url=https%3A%2F%2Fexample.com"',
    );
    expect(hatenaLinkToMarkdown('[https://example.com:title=公式]')).toBe(
      '[公式](https://example.com)',
    );
  });

  it('unescapeHatenaSyntax がエスケープされたはてな記法を復元すること', () => {
    const escaped =
      '\\[:contents\\]\n\\[f:id:taro:20261121120000j:image\\]\n\\>\\|ts\\|\ncode\n\\|\\|\\<';
    expect(unescapeHatenaSyntax(escaped)).toBe(
      '[:contents]\n[f:id:taro:20261121120000j:image]\n>|ts|\ncode\n||<',
    );
  });
});
