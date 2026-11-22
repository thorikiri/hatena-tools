import { describe, expect, it } from 'vitest';
import { hatenaToHtml } from './hatena-to-html.js';
import { htmlToHatena } from './html-to-hatena.js';

describe('htmlToHatena', () => {
  it('Tiptap 等のリッチエディタ HTML 出力をはてな記法へ変換すること', () => {
    const html = `<div data-toc-card="true">目次</div>
<h3>見出し</h3>
<p><strong>太字</strong> と <a href="https://example.com">リンク</a> と <code>code</code></p>
<div data-more-divider="true">続きを読む</div>
<pre><code class="language-ts">const a = 1;</code></pre>
<ul><li>項目1<ul><li>子項目1</li></ul></li></ul>
<ol><li>番号1</li></ol>
<blockquote cite="https://example.com"><p>引用文</p><footer>出典: <a href="https://example.com">出典タイトル</a></footer></blockquote>
<img src="https://cdn-ak.f.st-hatena.com/images/fotolife/t/taro/20261121/20261121120000.png" alt="画像" />
<iframe src="https://hatenablog-parts.com/embed?url=https%3A%2F%2Fexample.com%2Fcard"></iframe>
<hr />`;

    const hatena = htmlToHatena(html, {
      headingOptions: { levelOffset: -2, minLevel: 1 },
    });

    expect(hatena).toContain('[:contents]');
    expect(hatena).toContain('* 見出し');
    expect(hatena).toContain(
      '<strong>太字</strong> と [https://example.com:title=リンク] と `code`',
    );
    expect(hatena).toContain('====');
    expect(hatena).toContain('>|ts|\nconst a = 1;\n||<');
    expect(hatena).toContain('- 項目1\n-- 子項目1');
    expect(hatena).toContain('+ 番号1');
    expect(hatena).toContain(
      '>https://example.com:title=出典タイトル>\n引用文\n<<',
    );
    expect(hatena).toContain('[f:id:taro:20261121120000p:image]');
    expect(hatena).toContain('[https://example.com/card:embed]');
    expect(hatena).toContain('----');
  });

  it('hatenaToHtml からの往復変換で脚注や定義リストが復元されること', () => {
    const original = `* 大見出し

本文((脚注内容))です。

:用語:説明文`;

    const html = hatenaToHtml(original);
    const restored = htmlToHatena(html);

    expect(restored).toContain('* 大見出し');
    expect(restored).toContain('本文((脚注内容))です。');
    expect(restored).toContain(':用語:説明文');
  });

  it('HTML テーブルをはてな表組み記法に変換すること', () => {
    const hatena = htmlToHatena(
      '<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>',
    );
    expect(hatena).toBe('|*A|*B|\n|1|2|');
  });
});
