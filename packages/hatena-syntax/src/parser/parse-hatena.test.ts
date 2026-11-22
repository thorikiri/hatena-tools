import { describe, expect, it } from 'vitest';
import { parseHatena } from './parse-hatena.js';
import { parseHatenaPhotoSyntax } from './photo-syntax.js';

describe('parseHatenaPhotoSyntax', () => {
  it('フォトライフ記法をパースして画像URL等を抽出すること', () => {
    const result = parseHatenaPhotoSyntax(
      '[f:id:taro:20261121120000j:image:w400]',
    );
    expect(result).toEqual({
      user: 'taro',
      date: '20261121',
      time: '120000',
      extCode: 'j',
      ext: 'jpg',
      photoId: '20261121120000',
      options: ':image:w400',
      imageUrl:
        'https://cdn-ak.f.st-hatena.com/images/fotolife/t/taro/20261121/20261121120000.jpg',
      syntax: 'f:id:taro:20261121120000j:image:w400',
    });

    expect(parseHatenaPhotoSyntax('not a photo')).toBeNull();
  });
});

describe('parseHatena', () => {
  it('見出し・目次・続きを読む・水平線・段落をパースすること', () => {
    const doc = parseHatena(`[:contents]

* 大見出し
** 中見出し
*** 小見出し
**** レベル4見出し

本文テキストです。

====[もっと読む]

----`);

    expect(doc.blocks).toHaveLength(8);
    expect(doc.blocks[0]).toEqual({ type: 'toc' });
    expect(doc.blocks[1]).toMatchObject({ type: 'heading', level: 1 });
    expect(doc.blocks[2]).toMatchObject({ type: 'heading', level: 2 });
    expect(doc.blocks[3]).toMatchObject({ type: 'heading', level: 3 });
    expect(doc.blocks[4]).toMatchObject({ type: 'heading', level: 4 });
    expect(doc.blocks[5]).toEqual({
      type: 'paragraph',
      children: [{ type: 'text', value: '本文テキストです。' }],
    });
    expect(doc.blocks[6]).toEqual({ type: 'more', label: 'もっと読む' });
    expect(doc.blocks[7]).toEqual({ type: 'hr' });
  });

  it('リスト（箇条書き・番号付き・ネスト）と定義リストをパースすること', () => {
    const doc = parseHatena(`- 項目1
-- 子項目1
+ 番号1
++ 子番号1

:TypeScript:型付きJavaScript
:Vitest:高速なテストランナー`);

    expect(doc.blocks).toHaveLength(3);
    expect(doc.blocks[0]).toMatchObject({
      type: 'list',
      ordered: false,
      items: [
        {
          children: [{ type: 'text', value: '項目1' }],
          subLists: [
            {
              type: 'list',
              ordered: false,
              items: [{ children: [{ type: 'text', value: '子項目1' }] }],
            },
          ],
        },
      ],
    });
    expect(doc.blocks[1]).toMatchObject({ type: 'list', ordered: true });
    expect(doc.blocks[2]).toMatchObject({
      type: 'definitionList',
      items: [
        {
          term: [{ type: 'text', value: 'TypeScript' }],
          description: [{ type: 'text', value: '型付きJavaScript' }],
        },
        {
          term: [{ type: 'text', value: 'Vitest' }],
          description: [{ type: 'text', value: '高速なテストランナー' }],
        },
      ],
    });
  });

  it('スーパーpre記法と引用記法（出典URL付き含む）をパースすること', () => {
    const doc = parseHatena(`>|typescript|
const x = *not heading*;
||<

>https://example.com:title=サンプルサイト>
引用文です。
<<`);

    expect(doc.blocks).toHaveLength(2);
    expect(doc.blocks[0]).toEqual({
      type: 'codeBlock',
      lang: 'typescript',
      code: 'const x = *not heading*;',
    });
    expect(doc.blocks[1]).toEqual({
      type: 'blockquote',
      citeUrl: 'https://example.com',
      citeTitle: 'サンプルサイト',
      children: [
        {
          type: 'paragraph',
          children: [{ type: 'text', value: '引用文です。' }],
        },
      ],
    });
  });

  it('インライン記法（リンク・フォトライフ・埋め込み・脚注・太字・コード）をパースすること', () => {
    const doc = parseHatena(
      '詳細は[https://example.com:title=公式サイト]と[https://example.com/card:embed]と[f:id:taro:20261121120000p:image]を参照((脚注テキスト))。**太字**と`code`と[youtube:dQw4w9WgXcQ]。',
    );

    expect(doc.blocks).toHaveLength(1);
    const para = doc.blocks[0];
    if (para?.type !== 'paragraph') throw new Error('expected paragraph');

    expect(para.children).toEqual([
      { type: 'text', value: '詳細は' },
      {
        type: 'link',
        url: 'https://example.com',
        title: '公式サイト',
        mode: 'title',
      },
      { type: 'text', value: 'と' },
      { type: 'link', url: 'https://example.com/card', mode: 'embed' },
      { type: 'text', value: 'と' },
      expect.objectContaining({
        type: 'photo',
        user: 'taro',
        ext: 'png',
      }),
      { type: 'text', value: 'を参照' },
      {
        type: 'footnote',
        id: 1,
        children: [{ type: 'text', value: '脚注テキスト' }],
      },
      { type: 'text', value: '。' },
      { type: 'bold', children: [{ type: 'text', value: '太字' }] },
      { type: 'text', value: 'と' },
      { type: 'code', value: 'code' },
      { type: 'text', value: 'と' },
      { type: 'embed', provider: 'youtube', id: 'dQw4w9WgXcQ' },
      { type: 'text', value: '。' },
    ]);

    expect(doc.footnotes).toEqual([
      { id: 1, children: [{ type: 'text', value: '脚注テキスト' }] },
    ]);
  });

  it('表組み記法（|...| / |*...|）をパースすること', () => {
    const doc = parseHatena(`|*名前|*役割|
|太郎|エンジニア|`);

    expect(doc.blocks).toEqual([
      {
        type: 'table',
        rows: [
          [
            { header: true, children: [{ type: 'text', value: '名前' }] },
            { header: true, children: [{ type: 'text', value: '役割' }] },
          ],
          [
            { header: false, children: [{ type: 'text', value: '太郎' }] },
            {
              header: false,
              children: [{ type: 'text', value: 'エンジニア' }],
            },
          ],
        ],
      },
    ]);
  });

  it('行頭に半角スペースがある場合は見出し・リスト等として解釈しないこと', () => {
    const doc = parseHatena(` * 見出しではない
 - リストではない
 :定義:ではない`);

    expect(doc.blocks).toEqual([
      {
        type: 'paragraph',
        children: [
          {
            type: 'text',
            value: ' * 見出しではない\n - リストではない\n :定義:ではない',
          },
        ],
      },
    ]);
  });

  it('角括弧なしの fotolife 記法と :title= / :alt= オプションをパースすること', () => {
    const doc = parseHatena(
      '画像 f:id:taro:20261121120000p:plain:title=題名:alt=説明 です。',
    );
    expect(doc.blocks[0]).toEqual({
      type: 'paragraph',
      children: [
        { type: 'text', value: '画像 ' },
        expect.objectContaining({
          type: 'photo',
          user: 'taro',
          ext: 'png',
          title: '題名',
          alt: '説明',
        }),
        { type: 'text', value: ' です。' },
      ],
    });
  });

  it('tex 記法（[tex:...] / [$ ... $]）をパースし、内部の * や _ を誤装飾しないこと', () => {
    const doc = parseHatena('数式 [tex:a_1 * b_2] と [$ x^2 + y^2 $] です。');
    expect(doc.blocks[0]).toEqual({
      type: 'paragraph',
      children: [
        { type: 'text', value: '数式 ' },
        { type: 'tex', value: 'a_1 * b_2', syntax: 'tex' },
        { type: 'text', value: ' と ' },
        { type: 'tex', value: 'x^2 + y^2', syntax: 'dollar' },
        { type: 'text', value: ' です。' },
      ],
    });
  });

  it('スーパー続きを読む記法（=====）をパースすること', () => {
    const doc = parseHatena('=====\n=====[続き]');
    expect(doc.blocks).toEqual([
      { type: 'more', super: true },
      { type: 'more', label: '続き', super: true },
    ]);
  });

  it('自動リンク停止記法（[]...[]）で内部を展開せずテキスト化すること', () => {
    const doc = parseHatena(
      '停止 []https://example.com[] と [][f:id:taro:20261121120000p:plain][] です。',
    );
    expect(doc.blocks[0]).toEqual({
      type: 'paragraph',
      children: [
        {
          type: 'text',
          value:
            '停止 https://example.com と [f:id:taro:20261121120000p:plain] です。',
        },
      ],
    });
  });

  it('id 記法（角括弧あり/なし・オプション付き）をパースすること', () => {
    const doc = parseHatena('id:taro と [id:hanako:image] と android:id:test');
    expect(doc.blocks[0]).toEqual({
      type: 'paragraph',
      children: [
        { type: 'embed', provider: 'hatenaId', id: 'taro' },
        { type: 'text', value: ' と ' },
        {
          type: 'embed',
          provider: 'hatenaId',
          id: 'hanako',
          option: 'image',
        },
        { type: 'text', value: ' と android:id:test' },
      ],
    });
  });

  it('isbn 記法および角括弧なし asin/isbn 記法をパースすること', () => {
    const doc = parseHatena(
      'isbn:4774192392:title と asin:B000000001 と [isbn:978-4-7741-9239-0]',
    );
    expect(doc.blocks[0]).toEqual({
      type: 'paragraph',
      children: [
        { type: 'embed', provider: 'isbn', id: '4774192392', option: 'title' },
        { type: 'text', value: ' と ' },
        { type: 'embed', provider: 'asin', id: 'B000000001' },
        { type: 'text', value: ' と ' },
        { type: 'embed', provider: 'isbn', id: '978-4-7741-9239-0' },
      ],
    });
  });

  it('question 記法（角括弧あり/なし）をパースすること', () => {
    const doc = parseHatena('question:123456:title と [question:789012]');
    expect(doc.blocks[0]).toEqual({
      type: 'paragraph',
      children: [
        { type: 'embed', provider: 'question', id: '123456', option: 'title' },
        { type: 'text', value: ' と ' },
        { type: 'embed', provider: 'question', id: '789012' },
      ],
    });
  });

  it('google 記法（[google:...] / :image / :news）をパースすること', () => {
    const doc = parseHatena('[google:TypeScript] と [google:image:猫]');
    expect(doc.blocks[0]).toEqual({
      type: 'paragraph',
      children: [
        { type: 'embed', provider: 'google', id: 'TypeScript' },
        { type: 'text', value: ' と ' },
        { type: 'embed', provider: 'google', id: '猫', option: 'image' },
      ],
    });
  });
});
