import { describe, expect, it } from 'vitest';
import {
  escapeXml,
  findAllDescendants,
  findChild,
  findChildren,
  parseXml,
  unescapeXml,
} from './simple-xml.js';

describe('simple-xml', () => {
  it('escapeXml と unescapeXml が相互変換できること', () => {
    const raw = `<tag attr="1" single='2'>a & b</tag>`;
    const escaped = escapeXml(raw);
    expect(escaped).toBe(
      '&lt;tag attr=&quot;1&quot; single=&apos;2&apos;&gt;a &amp; b&lt;/tag&gt;',
    );
    expect(unescapeXml(escaped)).toBe(raw);
    expect(unescapeXml('&#65;&#x42;')).toBe('AB');
  });

  it('入れ子・属性・名前空間・CDATA・コメントを含む XML をパースできること', () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<!-- comment -->
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:app="http://www.w3.org/2007/app">
  <link rel="next" href="https://blog.hatena.ne.jp/next?page=2" />
  <entry>
    <title>タイトル &amp; サブ</title>
    <content type="text/x-markdown"><![CDATA[# 見出し\n<p>HTML</p>]]></content>
    <app:control>
      <app:draft>yes</app:draft>
    </app:control>
  </entry>
</feed>`;

    const root = parseXml(xml);
    expect(root).not.toBeNull();
    if (!root) throw new Error('root is null');
    expect(root.localName).toBe('feed');

    const links = findChildren(root, 'link');
    expect(links).toHaveLength(1);
    expect(links[0]?.attributes.rel).toBe('next');
    expect(links[0]?.attributes.href).toBe(
      'https://blog.hatena.ne.jp/next?page=2',
    );

    const entry = findChild(root, 'entry');
    expect(entry).toBeDefined();
    if (!entry) throw new Error('entry is undefined');
    expect(findChild(entry, 'title')?.text).toBe('タイトル & サブ');
    expect(findChild(entry, 'content')?.text).toBe('# 見出し\n<p>HTML</p>');
    expect(findAllDescendants(entry, 'draft')[0]?.text).toBe('yes');
  });
});
