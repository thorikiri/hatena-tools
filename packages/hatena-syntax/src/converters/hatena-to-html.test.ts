import { describe, expect, it } from 'vitest';
import { hatenaToHtml } from './hatena-to-html.js';

describe('hatenaToHtml', () => {
  it('見出し・目次・段落・リスト・定義リスト・水平線をセマンティックな HTML に変換すること', () => {
    const hatena = `[:contents]

* 大見出し
** 中見出し

本文です。**太字** と \`code\` と [https://example.com:title=リンク] があります。

- 箇条書き1
-- ネスト項目
+ 番号1

:TypeScript:型付きJS

----
====`;

    const html = hatenaToHtml(hatena);

    expect(html).toContain('<nav class="hatena-toc" data-toc>');
    expect(html).toContain(
      '<li class="toc-level-1"><a href="#heading-1">大見出し</a></li>',
    );
    expect(html).toContain('<h1 id="heading-1">大見出し</h1>');
    expect(html).toContain('<h2 id="heading-2">中見出し</h2>');
    expect(html).toContain(
      '<p>本文です。<strong>太字</strong> と <code>code</code> と <a href="https://example.com">リンク</a> があります。</p>',
    );
    expect(html).toContain(
      '<ul>\n<li>箇条書き1\n<ul>\n<li>ネスト項目</li>\n</ul></li>\n</ul>',
    );
    expect(html).toContain('<ol>\n<li>番号1</li>\n</ol>');
    expect(html).toContain(
      '<dl>\n<dt>TypeScript</dt>\n<dd>型付きJS</dd>\n</dl>',
    );
    expect(html).toContain('<hr />');
    expect(html).toContain('<!--more-->');
  });

  it('スーパーpre・引用・脚注・ブログカード・フォトライフを変換すること', () => {
    const hatena = `>|ts|
const a = "<script>alert(1)</script>";
||<

>https://example.com:title=出典サイト>
引用テキスト
<<

脚注テスト((補足説明です))。
[https://example.com/post:embed]
[f:id:taro:20261121120000p:plain]`;

    const html = hatenaToHtml(hatena, {
      photoLoading: 'lazy',
      headingOptions: { levelOffset: 2 },
    });

    expect(html).toContain(
      '<pre><code class="language-ts">const a = &quot;&lt;script&gt;alert(1)&lt;/script&gt;&quot;;</code></pre>',
    );
    expect(html).toContain('<blockquote cite="https://example.com">');
    expect(html).toContain(
      '<footer>出典: <a href="https://example.com">出典サイト</a></footer>',
    );
    expect(html).toContain(
      '<sup id="fnref-1"><a href="#fn-1" class="footnote-ref">*1</a></sup>',
    );
    expect(html).toContain('<section class="footnotes">');
    expect(html).toContain(
      '<li id="fn-1">補足説明です <a href="#fnref-1" class="footnote-backref">↩</a></li>',
    );
    expect(html).toContain('class="embed-card embed-blogcard"');
    expect(html).toContain('loading="lazy"');
  });

  it('XSS となる生 HTML や危険な URL スキームを無害化すること', () => {
    const html = hatenaToHtml(
      '<script>alert("xss")</script> [javascript:alert(1):title=危険]',
    );
    expect(html).not.toContain('<script>');
    expect(html).toContain(
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;',
    );
    expect(html).not.toContain('href="javascript:');
  });

  it('カスタムレンダラーフックが動作すること', () => {
    const html = hatenaToHtml('* 見出し\n\n>|js|\nconsole.log(1)\n||<', {
      renderers: {
        heading: (_node, childrenHtml, level) =>
          `<h${level} class="custom">${childrenHtml}</h${level}>`,
        codeBlock: (node) => `<div data-lang="${node.lang}">${node.code}</div>`,
      },
    });
    expect(html).toContain('<h1 class="custom">見出し</h1>');
    expect(html).toContain('<div data-lang="js">console.log(1)</div>');
  });
});
