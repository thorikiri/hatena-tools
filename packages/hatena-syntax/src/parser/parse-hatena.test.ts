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
});
