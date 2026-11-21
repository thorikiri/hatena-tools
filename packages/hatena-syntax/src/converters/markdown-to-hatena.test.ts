import { describe, expect, it } from 'vitest';
import { markdownToHatena } from './markdown-to-hatena.js';

describe('markdownToHatena', () => {
  it('見出し・コードブロック・引用・リスト・水平線・more をはてな記法に変換すること', () => {
    const md = `# タイトル
## セクション

\`\`\`ts
const x = *not bold*;
\`\`\`

> 引用行1
> 引用行2

- 項目1
  - 子項目1
1. 番号1

---
<!--more-->`;

    const hatena = markdownToHatena(md);

    expect(hatena).toContain('* タイトル');
    expect(hatena).toContain('** セクション');
    expect(hatena).toContain('>|ts|\nconst x = *not bold*;\n||<');
    expect(hatena).toContain('>>\n引用行1\n引用行2\n<<');
    expect(hatena).toContain('- 項目1\n-- 子項目1\n+ 番号1');
    expect(hatena).toContain('----');
    expect(hatena).toContain('====');
  });

  it('リンク・フォトライフ画像URL・装飾・脚注・インラインコード保護が動作すること', () => {
    const md = `**太字** と *斜体* と ~~削除~~ と \`[https://keep.me](keep)\` です。
[Example](https://example.com)
![alt](https://cdn-ak.f.st-hatena.com/images/fotolife/t/taro/20261121/20261121120000.png)
脚注テスト[^1]。

[^1]: 脚注の中身`;

    const hatena = markdownToHatena(md, {
      headingOptions: { levelOffset: -1, minLevel: 1 },
    });

    expect(hatena).toContain('<strong>太字</strong>');
    expect(hatena).toContain('<em>斜体</em>');
    expect(hatena).toContain('<del>削除</del>');
    expect(hatena).toContain('`[https://keep.me](keep)`');
    expect(hatena).toContain('[https://example.com:title=Example]');
    expect(hatena).toContain('[f:id:taro:20261121120000p:image]');
    expect(hatena).toContain('脚注テスト((脚注の中身))。');
    expect(hatena).not.toContain('[^1]:');
  });
});
