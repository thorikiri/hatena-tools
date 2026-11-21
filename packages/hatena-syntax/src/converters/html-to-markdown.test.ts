import { describe, expect, it } from 'vitest';
import { htmlToMarkdown } from './html-to-markdown.js';
import { markdownToHtml } from './markdown-to-html.js';

describe('htmlToMarkdown', () => {
  it('Tiptap 等の HTML およびはてな由来要素を GFM 互換 Markdown に変換すること', () => {
    const html = `<div data-toc-card="true">目次</div>
<h2>見出し2</h2>
<p><strong>太字</strong> と <em>斜体</em> と <del>削除</del> と <code>code</code> と <a href="https://example.com">リンク</a></p>
<div data-more-divider="true">続きを読む</div>
<pre><code class="language-ts">const a = 1;</code></pre>
<ul><li>項目1<ul><li>子項目1</li></ul></li></ul>
<ol><li>番号1</li></ol>
<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>
<blockquote cite="https://example.com"><p>引用</p><footer>出典: <a href="https://example.com">引用元</a></footer></blockquote>
<iframe src="https://hatenablog-parts.com/embed?url=https%3A%2F%2Fexample.com%2Fcard"></iframe>
<hr />`;

    const md = htmlToMarkdown(html);

    expect(md).toContain('[:contents]');
    expect(md).toContain('## 見出し2');
    expect(md).toContain(
      '**太字** と *斜体* と ~~削除~~ と `code` と [リンク](https://example.com)',
    );
    expect(md).toContain('<!--more-->');
    expect(md).toContain('```ts\nconst a = 1;\n```');
    expect(md).toContain('- 項目1\n  - 子項目1');
    expect(md).toContain('1. 番号1');
    expect(md).toContain('| A | B |\n| --- | --- |\n| 1 | 2 |');
    expect(md).toContain('> 引用\n>\n> 出典: [引用元](https://example.com)');
    expect(md).toContain('[https://example.com/card:embed]');
    expect(md).toContain('---');
  });

  it('preserveHatenaPhotoSyntax オプションでフォトライフ画像を [f:id:...] へ復元できること', () => {
    const html = `<p><img src="https://cdn-ak.f.st-hatena.com/images/fotolife/t/taro/20261121/20261121120000.png" alt="画像" /></p>`;

    expect(htmlToMarkdown(html)).toBe(
      '![画像](https://cdn-ak.f.st-hatena.com/images/fotolife/t/taro/20261121/20261121120000.png)',
    );
    expect(htmlToMarkdown(html, { preserveHatenaPhotoSyntax: true })).toBe(
      '[f:id:taro:20261121120000p:image]',
    );
  });

  it('markdownToHtml からの往復変換で脚注や見出しが復元されること', () => {
    const original = `# タイトル

本文[^1]です。

[^1]: 脚注内容`;

    const html = markdownToHtml(original);
    const restored = htmlToMarkdown(html);

    expect(restored).toContain('# タイトル');
    expect(restored).toContain('本文[^1]です。');
    expect(restored).toContain('[^1]: 脚注内容');
  });
});
