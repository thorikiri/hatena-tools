import { describe, expect, it } from 'vitest';
import {
  formatHatenaPhotoSyntax,
  hatenaPhotoToHtml,
  hatenaPhotoToMarkdown,
  htmlImgToHatenaPhoto,
  imageUrlToHatenaPhoto,
} from './photo.js';

describe('photo unit converters', () => {
  const syntax = '[f:id:taro:20261121120000j:image]';
  const cdnUrl =
    'https://cdn-ak.f.st-hatena.com/images/fotolife/t/taro/20261121/20261121120000.jpg';

  it('formatHatenaPhotoSyntax が記法やURLを整形すること', () => {
    expect(formatHatenaPhotoSyntax(syntax)).toBe(syntax);
    expect(formatHatenaPhotoSyntax('f:id:taro:20261121120000j:image')).toBe(
      syntax,
    );
    expect(
      formatHatenaPhotoSyntax('https://example.com/a.png', 'pic.png'),
    ).toBe('![pic.png](https://example.com/a.png)');
  });

  it('hatenaPhotoToHtml / hatenaPhotoToMarkdown が変換できること', () => {
    expect(
      hatenaPhotoToHtml(syntax, { className: 'photo', loading: 'lazy' }),
    ).toBe(
      `<img src="${cdnUrl}" alt="f:id:taro:20261121120000j:image" class="photo" loading="lazy" />`,
    );

    expect(hatenaPhotoToMarkdown(syntax, { alt: '夕焼け' })).toBe(
      `![夕焼け](${cdnUrl})`,
    );
  });

  it('imageUrlToHatenaPhoto / htmlImgToHatenaPhoto が逆変換できること', () => {
    expect(imageUrlToHatenaPhoto(cdnUrl)).toBe(syntax);
    expect(
      htmlImgToHatenaPhoto(
        `<img src="${cdnUrl}" alt="f:id:taro:20261121120000j:image:w400" />`,
      ),
    ).toBe('[f:id:taro:20261121120000j:image:w400]');
    expect(htmlImgToHatenaPhoto(`<img src="${cdnUrl}" alt="写真" />`)).toBe(
      syntax,
    );
    expect(
      htmlImgToHatenaPhoto('<img src="https://example.com/a.jpg" />'),
    ).toBeNull();
  });

  it(':title= や :alt= オプションおよび角括弧なし記法を変換できること', () => {
    const withTitleAlt =
      'f:id:taro:20261121120000j:plain:title=写真タイトル:alt=代替テキスト';
    expect(hatenaPhotoToHtml(withTitleAlt)).toBe(
      `<img src="${cdnUrl}" alt="代替テキスト" title="写真タイトル" />`,
    );
    expect(hatenaPhotoToMarkdown(withTitleAlt)).toBe(
      `![代替テキスト](${cdnUrl})`,
    );
  });
});
