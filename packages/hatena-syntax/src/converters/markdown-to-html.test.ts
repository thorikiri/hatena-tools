import { describe, expect, it } from 'vitest';
import { markdownToHtml } from './markdown-to-html.js';

describe('markdownToHtml', () => {
  it('標準 Markdown（見出し・装飾・リスト・テーブル・コードブロック・脚注）を HTML に変換すること', () => {
    const md = `# タイトル
## セクション

**太字** と *斜体* と ~~削除~~ と \`code\` と [リンク](https://example.com) です。

- 親項目
  - 子項目
1. 番号1

| 列A | 列B |
| --- | --- |
| 値1 | 値2 |

\`\`\`ts
const x = "<span>";
\`\`\`

脚注[^1]あり。

[^1]: 脚注の説明`;

    const html = markdownToHtml(md);

    expect(html).toContain('<h1 id="heading-1">タイトル</h1>');
    expect(html).toContain('<h2 id="heading-2">セクション</h2>');
    expect(html).toContain(
      '<strong>太字</strong> と <em>斜体</em> と <del>削除</del> と <code>code</code> と <a href="https://example.com">リンク</a> です。',
    );
    expect(html).toContain(
      '<ul>\n<li>親項目\n<ul>\n<li>子項目</li>\n</ul></li>\n</ul>',
    );
    expect(html).toContain('<ol>\n<li>番号1</li>\n</ol>');
    expect(html).toContain(
      '<table>\n<thead>\n<tr><th>列A</th><th>列B</th></tr>\n</thead>',
    );
    expect(html).toContain('<td>値1</td><td>値2</td>');
    expect(html).toContain(
      '<pre><code class="language-ts">const x = &quot;&lt;span&gt;&quot;;</code></pre>',
    );
    expect(html).toContain(
      '<sup id="fnref-1"><a href="#fn-1" class="footnote-ref">*1</a></sup>',
    );
    expect(html).toContain(
      '<li id="fn-1">脚注の説明 <a href="#fnref-1" class="footnote-backref">↩</a></li>',
    );
  });

  it('Markdown 内に混在するはてな独自記法（[:contents], [f:id:...], [URL:embed], [youtube:...], ((脚注))）を展開すること', () => {
    const md = `[:contents]

# はてな記法混在テスト

[f:id:taro:20261121120000p:plain]
[https://example.com/post:embed]
[https://example.com/bm:bookmark]
[youtube:dQw4w9WgXcQ]
本文((はてな脚注))です。`;

    const html = markdownToHtml(md, { photoLoading: 'lazy' });

    expect(html).toContain('<nav class="hatena-toc" data-toc>');
    expect(html).toContain(
      '<li class="toc-level-1"><a href="#heading-1">はてな記法混在テスト</a></li>',
    );
    expect(html).toContain(
      '<img src="https://cdn-ak.f.st-hatena.com/images/fotolife/t/taro/20261121/20261121120000.png" alt="f:id:taro:20261121120000p:plain" loading="lazy" />',
    );
    expect(html).toContain('class="embed-card embed-blogcard"');
    expect(html).toContain('class="hatena-bookmark-link"');
    expect(html).toContain('https://www.youtube.com/embed/dQw4w9WgXcQ');
    expect(html).toContain(
      '<li id="fn-1">はてな脚注 <a href="#fnref-1" class="footnote-backref">↩</a></li>',
    );
  });

  it('enableHatenaSyntax: false の場合ははてな独自記法を展開せず、XSS ペイロードを無害化すること', () => {
    const md = `<script>alert(1)</script> [danger](javascript:alert(1)) [f:id:taro:20261121120000p:plain]`;
    const html = markdownToHtml(md, { enableHatenaSyntax: false });

    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('href="javascript:');
    expect(html).not.toContain('<img');
  });
});
