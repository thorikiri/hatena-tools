import { describe, expect, it } from 'vitest';
import {
  buildFotolifeUpdateXml,
  buildFotolifeUploadXml,
  parseFotolifeEntryXml,
  parseFotolifeFeedXml,
} from './fotolife-xml.js';

describe('fotolife-xml', () => {
  it('buildFotolifeUploadXml が Base64・フォルダ・generator 指定を含む XML を生成すること', () => {
    const bytes = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
    const xml = buildFotolifeUploadXml({
      file: bytes,
      title: 'photo & 1.png',
      contentType: 'image/png',
      folder: 'Blog',
      generator: 'jiblog-butler',
    });

    expect(xml).toContain('<title>photo &amp; 1.png</title>');
    expect(xml).toContain(
      '<content mode="base64" type="image/png">SGVsbG8=</content>',
    );
    expect(xml).toContain('<dc:subject>Blog</dc:subject>');
    expect(xml).toContain('<generator>jiblog-butler</generator>');
  });

  it('buildFotolifeUpdateXml がタイトル更新用 XML を生成すること', () => {
    const xml = buildFotolifeUpdateXml({ title: '新しい & タイトル' });
    expect(xml).toContain('<entry xmlns="http://purl.org/atom/ns#">');
    expect(xml).toContain('<title>新しい &amp; タイトル</title>');
  });

  it('parseFotolifeEntryXml がアップロードレスポンスをパースすること', () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<entry xmlns="http://purl.org/atom/ns#" xmlns:hatena="http://www.hatena.ne.jp/info/xmlns#">
  <title>sunset.jpg</title>
  <link rel="alternate" type="text/html" href="https://f.hatena.ne.jp/taro/20261119123456" />
  <link rel="service.edit" type="application/x.atom+xml" href="https://f.hatena.ne.jp/atom/edit/20261119123456" />
  <issued>2026-11-19T12:34:56+09:00</issued>
  <hatena:imageurl>https://cdn-ak.f.st-hatena.com/images/fotolife/t/taro/20261119/20261119123456.jpg</hatena:imageurl>
  <hatena:imageurlsmall>https://cdn-ak.f.st-hatena.com/images/fotolife/t/taro/20261119/20261119123456_m.gif</hatena:imageurlsmall>
  <hatena:syntax>f:id:taro:20261119123456j:image</hatena:syntax>
</entry>`;

    const entry = parseFotolifeEntryXml(xml);
    expect(entry).toEqual({
      photoId: '20261119123456',
      title: 'sunset.jpg',
      imageUrl:
        'https://cdn-ak.f.st-hatena.com/images/fotolife/t/taro/20261119/20261119123456.jpg',
      imageUrlSmall:
        'https://cdn-ak.f.st-hatena.com/images/fotolife/t/taro/20261119/20261119123456_m.gif',
      pageUrl: 'https://f.hatena.ne.jp/taro/20261119123456',
      syntax: 'f:id:taro:20261119123456j:image',
      editUrl: 'https://f.hatena.ne.jp/atom/edit/20261119123456',
      hatenaUser: 'taro',
      issued: new Date('2026-11-19T12:34:56+09:00'),
    });
  });

  it('parseFotolifeFeedXml が写真一覧と editUrl フォールバックをパースすること', () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://purl.org/atom/ns#" xmlns:hatena="http://www.hatena.ne.jp/info/xmlns#">
  <author>
    <name>taro</name>
  </author>
  <entry>
    <title>photo1</title>
    <hatena:imageurl>https://cdn-ak.f.st-hatena.com/images/fotolife/t/taro/20261119/20261119000001.jpg</hatena:imageurl>
    <hatena:syntax>f:id:taro:20261119000001j:image</hatena:syntax>
  </entry>
</feed>`;

    const feed = parseFotolifeFeedXml(xml);
    expect(feed.hatenaUser).toBe('taro');
    expect(feed.photos).toHaveLength(1);
    expect(feed.photos[0]).toMatchObject({
      photoId: '20261119000001',
      title: 'photo1',
      editUrl: 'https://f.hatena.ne.jp/atom/edit/20261119000001',
      hatenaUser: 'taro',
      imageUrlSmall: null,
      pageUrl: null,
    });
  });
});
