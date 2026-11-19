import { describe, expect, it } from 'vitest';
import {
  buildFotolifeUploadXml,
  parseFotolifeEntryXml,
  parseFotolifeFeedXml,
} from './fotolife-xml.js';

describe('fotolife-xml', () => {
  it('buildFotolifeUploadXml が Base64 とフォルダ指定を含む XML を生成すること', () => {
    const bytes = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
    const xml = buildFotolifeUploadXml({
      file: bytes,
      title: 'photo & 1.png',
      contentType: 'image/png',
      folder: 'Blog',
    });

    expect(xml).toContain('<title>photo &amp; 1.png</title>');
    expect(xml).toContain(
      '<content mode="base64" type="image/png">SGVsbG8=</content>',
    );
    expect(xml).toContain('<dc:subject>Blog</dc:subject>');
  });

  it('parseFotolifeEntryXml がアップロードレスポンスをパースすること', () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<entry xmlns="http://purl.org/atom/ns#" xmlns:hatena="http://www.hatena.ne.jp/info/xmlns#">
  <title>sunset.jpg</title>
  <link rel="service.edit" type="application/x.atom+xml" href="https://f.hatena.ne.jp/atom/edit/20261119123456" />
  <issued>2026-11-19T12:34:56+09:00</issued>
  <hatena:imageurl>https://cdn-ak.f.st-hatena.com/images/fotolife/t/taro/20261119/20261119123456.jpg</hatena:imageurl>
  <hatena:syntax>f:id:taro:20261119123456j:image</hatena:syntax>
</entry>`;

    const entry = parseFotolifeEntryXml(xml);
    expect(entry).toEqual({
      photoId: '20261119123456',
      title: 'sunset.jpg',
      imageUrl:
        'https://cdn-ak.f.st-hatena.com/images/fotolife/t/taro/20261119/20261119123456.jpg',
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
    });
  });
});
