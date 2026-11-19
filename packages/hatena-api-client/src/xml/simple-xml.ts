/**
 * 軽量 XML 要素ノード
 */
export interface XmlElement {
  /** プレフィックスを含むタグ名（例: "app:draft"） */
  name: string;
  /** プレフィックスを除いたローカル名（例: "draft"） */
  localName: string;
  /** 属性マップ */
  attributes: Record<string, string>;
  /** 子要素リスト */
  children: XmlElement[];
  /** 要素内のテキスト（子要素のテキストは含まない、CDATA含む） */
  text: string;
}

/**
 * XML 特殊文字をエスケープする
 */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * XML エンティティをアンエスケープする
 */
export function unescapeXml(value: string): string {
  return value.replace(
    /&(#x[0-9a-fA-F]+|#[0-9]+|lt|gt|amp|quot|apos);/g,
    (match, entity: string) => {
      switch (entity) {
        case 'lt':
          return '<';
        case 'gt':
          return '>';
        case 'amp':
          return '&';
        case 'quot':
          return '"';
        case 'apos':
          return "'";
        default: {
          if (entity.startsWith('#x')) {
            const code = Number.parseInt(entity.slice(2), 16);
            return Number.isNaN(code) ? match : String.fromCodePoint(code);
          }
          if (entity.startsWith('#')) {
            const code = Number.parseInt(entity.slice(1), 10);
            return Number.isNaN(code) ? match : String.fromCodePoint(code);
          }
          return match;
        }
      }
    },
  );
}

function parseAttributes(attrString: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrRegex = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let match: RegExpExecArray | null = attrRegex.exec(attrString);
  while (match !== null) {
    const key = match[1];
    const rawValue = match[2] ?? match[3] ?? '';
    if (key) {
      attrs[key] = unescapeXml(rawValue);
    }
    match = attrRegex.exec(attrString);
  }
  return attrs;
}

function getLocalName(tagName: string): string {
  const colonIndex = tagName.indexOf(':');
  return colonIndex === -1 ? tagName : tagName.slice(colonIndex + 1);
}

/**
 * 軽量 XML パーサー（外部依存なし、Universal Runtime 対応）
 */
export function parseXml(xml: string): XmlElement | null {
  const rootWrapper: XmlElement = {
    name: '__root__',
    localName: '__root__',
    attributes: {},
    children: [],
    text: '',
  };
  const stack: XmlElement[] = [rootWrapper];
  let index = 0;

  while (index < xml.length) {
    const ltIndex = xml.indexOf('<', index);
    if (ltIndex === -1) {
      const trailing = xml.slice(index);
      const current = stack[stack.length - 1];
      if (current && trailing) {
        current.text += unescapeXml(trailing);
      }
      break;
    }

    if (ltIndex > index) {
      const textChunk = xml.slice(index, ltIndex);
      const current = stack[stack.length - 1];
      if (current) {
        current.text += unescapeXml(textChunk);
      }
    }

    // コメント <!-- ... -->
    if (xml.startsWith('<!--', ltIndex)) {
      const commentEnd = xml.indexOf('-->', ltIndex + 4);
      index = commentEnd === -1 ? xml.length : commentEnd + 3;
      continue;
    }

    // CDATA <![CDATA[ ... ]]>
    if (xml.startsWith('<![CDATA[', ltIndex)) {
      const cdataEnd = xml.indexOf(']]>', ltIndex + 9);
      if (cdataEnd === -1) {
        const current = stack[stack.length - 1];
        if (current) {
          current.text += xml.slice(ltIndex + 9);
        }
        break;
      }
      const current = stack[stack.length - 1];
      if (current) {
        current.text += xml.slice(ltIndex + 9, cdataEnd);
      }
      index = cdataEnd + 3;
      continue;
    }

    // 処理命令 <?...?> または DOCTYPE <!...>
    if (xml.startsWith('<?', ltIndex) || xml.startsWith('<!', ltIndex)) {
      const endTag = xml.startsWith('<?', ltIndex) ? '?>' : '>';
      const declEnd = xml.indexOf(endTag, ltIndex + 2);
      index = declEnd === -1 ? xml.length : declEnd + endTag.length;
      continue;
    }

    const gtIndex = xml.indexOf('>', ltIndex + 1);
    if (gtIndex === -1) {
      break;
    }

    const tagContent = xml.slice(ltIndex + 1, gtIndex).trim();
    index = gtIndex + 1;

    if (!tagContent) continue;

    // 閉じタグ </...>
    if (tagContent.startsWith('/')) {
      const closeName = tagContent.slice(1).trim();
      for (let i = stack.length - 1; i >= 1; i--) {
        if (stack[i]?.name === closeName) {
          stack.length = i;
          break;
        }
      }
      continue;
    }

    const isSelfClosing = tagContent.endsWith('/');
    const cleanContent = isSelfClosing
      ? tagContent.slice(0, -1).trim()
      : tagContent;

    const spaceMatch = /\s/.exec(cleanContent);
    const tagName = spaceMatch
      ? cleanContent.slice(0, spaceMatch.index)
      : cleanContent;
    const attrPart = spaceMatch ? cleanContent.slice(spaceMatch.index + 1) : '';

    const element: XmlElement = {
      name: tagName,
      localName: getLocalName(tagName),
      attributes: attrPart ? parseAttributes(attrPart) : {},
      children: [],
      text: '',
    };

    const parent = stack[stack.length - 1];
    if (parent) {
      parent.children.push(element);
    }

    if (!isSelfClosing) {
      stack.push(element);
    }
  }

  return rootWrapper.children[0] ?? null;
}

/**
 * 指定したローカル名を持つ最初の子要素を返す
 */
export function findChild(
  parent: XmlElement,
  localName: string,
): XmlElement | undefined {
  return parent.children.find((child) => child.localName === localName);
}

/**
 * 指定したローカル名を持つすべての子要素を返す
 */
export function findChildren(
  parent: XmlElement,
  localName: string,
): XmlElement[] {
  return parent.children.filter((child) => child.localName === localName);
}

/**
 * 指定したローカル名を持つすべての子孫要素を返す
 */
export function findAllDescendants(
  parent: XmlElement,
  localName: string,
): XmlElement[] {
  const results: XmlElement[] = [];
  for (const child of parent.children) {
    if (child.localName === localName) {
      results.push(child);
    }
    results.push(...findAllDescendants(child, localName));
  }
  return results;
}
