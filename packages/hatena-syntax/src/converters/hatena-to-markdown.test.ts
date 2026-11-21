import { describe, expect, it } from 'vitest';
import { hatenaToMarkdown } from './hatena-to-markdown.js';

describe('hatenaToMarkdown', () => {
  it('見出し・装飾・リンク・フォトライフ・リスト・脚注を Markdown に変換すること', () => {
    const hatena = `* タイトル
** サブタイトル

文中の **太字** と ~~取り消し~~ と \`code\` と [https://example.com:title=リンク] です。

- 親項目
-- 子項目
+ 番号1

[f:id:taro:20261121120000p:plain]

脚注あり((詳細説明))。`;

    const md = hatenaToMarkdown(hatena);

    expect(md).toContain('# タイトル');
    expect(md).toContain('## サブタイトル');
    expect(md).toContain(
      '文中の **太字** と ~~取り消し~~ と `code` と [リンク](https://example.com) です。',
    );
    expect(md).toContain('- 親項目\n  - 子項目');
    expect(md).toContain('1. 番号1');
    expect(md).toContain(
      '![f:id:taro:20261121120000p:plain](https://cdn-ak.f.st-hatena.com/images/fotolife/t/taro/20261121/20261121120000.png)',
    );
    expect(md).toContain('脚注あり[^1]。');
    expect(md).toContain('[^1]: 詳細説明');
  });

  it('スーパーpre（バッククォート含む）と引用・見出しオフセットを変換すること', () => {
    const hatena = `* 見出し

>|md|
\`\`\`ts
const x = 1;
\`\`\`
||<

>https://example.com:title=引用元>
引用文
<<`;

    const md = hatenaToMarkdown(hatena, {
      headingOptions: { levelOffset: 1 },
    });

    expect(md).toContain('## 見出し');
    expect(md).toContain('````md\n```ts\nconst x = 1;\n```\n````');
    expect(md).toContain('> 引用文\n>\n> 出典: [引用元](https://example.com)');
  });
});
