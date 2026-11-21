import { unescapeHtml } from './html.js';

export type HtmlNode =
  | { type: 'text'; value: string }
  | { type: 'comment'; value: string }
  | {
      type: 'element';
      tag: string;
      attrs: Record<string, string>;
      children: HtmlNode[];
    };

const VOID_TAGS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

function parseAttributes(attrString: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrRegex =
    /([a-zA-Z0-9_:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match: RegExpExecArray | null = attrRegex.exec(attrString);
  while (match !== null) {
    const name = match[1]?.toLowerCase();
    if (name) {
      const rawValue = match[2] ?? match[3] ?? match[4] ?? '';
      attrs[name] = unescapeHtml(rawValue);
    }
    match = attrRegex.exec(attrString);
  }
  return attrs;
}

/**
 * 依存ゼロの軽量 HTML ツリーパーサー
 */
export function parseHtmlTree(html: string): HtmlNode[] {
  const rootChildren: HtmlNode[] = [];
  const stack: Array<{ tag: string; children: HtmlNode[] }> = [
    { tag: '#root', children: rootChildren },
  ];

  const tokenRegex =
    /<!--([\s\S]*?)-->|<\/([a-zA-Z0-9-]+)\s*>|<([a-zA-Z0-9-]+)((?:\s+[^<>]*?)?)\s*(\/?)>/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null = tokenRegex.exec(html);

  const pushText = (text: string) => {
    if (!text) return;
    const top = stack[stack.length - 1];
    if (top) {
      top.children.push({ type: 'text', value: text });
    }
  };

  while (match !== null) {
    if (match.index > lastIndex) {
      pushText(html.slice(lastIndex, match.index));
    }

    if (match[1] !== undefined) {
      const top = stack[stack.length - 1];
      if (top) {
        top.children.push({ type: 'comment', value: match[1] });
      }
    } else if (match[2] !== undefined) {
      const closeTag = match[2].toLowerCase();
      for (let i = stack.length - 1; i >= 1; i -= 1) {
        if (stack[i]?.tag === closeTag) {
          stack.length = i;
          break;
        }
      }
    } else if (match[3] !== undefined) {
      const tag = match[3].toLowerCase();
      const attrs = parseAttributes(match[4] ?? '');
      const selfClosing = match[5] === '/' || VOID_TAGS.has(tag);
      const element: Extract<HtmlNode, { type: 'element' }> = {
        type: 'element',
        tag,
        attrs,
        children: [],
      };
      const top = stack[stack.length - 1];
      if (top) {
        top.children.push(element);
      }
      if (!selfClosing) {
        stack.push({ tag, children: element.children });
      }
    }

    lastIndex = tokenRegex.lastIndex;
    match = tokenRegex.exec(html);
  }

  if (lastIndex < html.length) {
    pushText(html.slice(lastIndex));
  }

  return rootChildren;
}

/**
 * HtmlNode 配列からプレーンテキストを抽出する
 */
export function getRawText(nodes: HtmlNode[]): string {
  return nodes
    .map((node) => {
      if (node.type === 'text') return unescapeHtml(node.value);
      if (node.type === 'comment') return '';
      if (node.tag === 'br') return '\n';
      return getRawText(node.children);
    })
    .join('');
}
