import { escapeHtml } from '../utils/html.js';

/**
 * スーパーpre記法 (>|lang| ... ||<) を HTML (<pre><code>) へ変換する
 */
export function superPreToHtml(block: string): string {
  const match = /^>\|([a-zA-Z0-9_+-]*)\|\r?\n([\s\S]*?)\r?\n\|\|<$/.exec(
    block.trim(),
  );
  if (!match) return block;

  const lang = match[1]?.trim() ?? '';
  const code = match[2] ?? '';
  const classAttr = lang ? ` class="language-${escapeHtml(lang)}"` : '';
  return `<pre><code${classAttr}>${escapeHtml(code)}</code></pre>`;
}

/**
 * スーパーpre記法 (>|lang| ... ||<) を Markdown フェンスコードブロックへ変換する
 */
export function superPreToMarkdown(block: string): string {
  const match = /^>\|([a-zA-Z0-9_+-]*)\|\r?\n([\s\S]*?)\r?\n\|\|<$/.exec(
    block.trim(),
  );
  if (!match) return block;

  const lang = match[1]?.trim() ?? '';
  const code = match[2] ?? '';
  return `\`\`\`${lang}\n${code}\n\`\`\``;
}

/**
 * Markdown フェンスコードブロックをスーパーpre記法 (>|lang| ... ||<) へ変換する
 */
export function markdownCodeToSuperPre(block: string): string {
  const match = /^```([a-zA-Z0-9_+-]*)\r?\n([\s\S]*?)\r?\n```$/.exec(
    block.trim(),
  );
  if (!match) return block;

  const lang = match[1]?.trim() ?? '';
  const code = match[2] ?? '';
  return `>|${lang}|\n${code}\n||<`;
}

/**
 * はてな引用記法 (>> ... << / >URL> ... << / >URL:title=...> ... <<) を HTML へ変換する
 */
export function hatenaQuoteToHtml(block: string): string {
  const match =
    /^>(?:(https?:\/\/[^\s:>]+)(?::title=([^>\r\n]+))?)?>\r?\n([\s\S]*?)\r?\n<<$/.exec(
      block.trim(),
    );
  if (!match) return block;

  const url = match[1];
  const title = match[2]?.trim();
  const body = match[3] ?? '';
  const citeAttr = url ? ` cite="${escapeHtml(url)}"` : '';
  const paragraphs = body
    .split(/\r?\n/)
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join('\n');
  const citeFooter = url
    ? `\n<footer>出典: <a href="${escapeHtml(url)}">${escapeHtml(title || url)}</a></footer>`
    : '';

  return `<blockquote${citeAttr}>\n${paragraphs}${citeFooter}\n</blockquote>`;
}

/**
 * はてな引用記法を Markdown 引用 (> ...) へ変換する
 */
export function hatenaQuoteToMarkdown(block: string): string {
  const match =
    /^>(?:(https?:\/\/[^\s:>]+)(?::title=([^>\r\n]+))?)?>\r?\n([\s\S]*?)\r?\n<<$/.exec(
      block.trim(),
    );
  if (!match) return block;

  const url = match[1];
  const title = match[2]?.trim();
  const body = match[3] ?? '';
  const lines = body.split(/\r?\n/).map((line) => `> ${line}`);
  if (url) {
    lines.push('>');
    lines.push(`> 出典: [${title || url}](${url})`);
  }
  return lines.join('\n');
}

/**
 * Markdown 引用 (> ...) をはてな引用記法 (>> ... <<) へ変換する
 */
export function markdownQuoteToHatena(block: string): string {
  const lines = block.trim().split(/\r?\n/);
  if (!lines.every((line) => /^>\s?/.test(line))) {
    return block;
  }
  const inner = lines.map((line) => line.replace(/^>\s?/, '')).join('\n');
  return `>>\n${inner}\n<<`;
}

/**
 * はてなリンク記法 ([URL], [URL:title=...], [URL:embed], [URL:bookmark]) を HTML へ変換する
 */
export function hatenaLinkToHtml(syntax: string): string {
  const match =
    /^\[(https?:\/\/[^\s\]]+?)(?::(title(?:=([^\]]+))?|bookmark|embed))?\]$/.exec(
      syntax.trim(),
    );
  if (!match?.[1]) return syntax;

  const url = match[1];
  const suffix = match[2];
  const customTitle = match[3];

  if (suffix === 'embed') {
    const embedSrc = `https://hatenablog-parts.com/embed?url=${encodeURIComponent(url)}`;
    return `<iframe src="${escapeHtml(embedSrc)}" class="embed-card embed-blogcard" title="${escapeHtml(url)}" loading="lazy"></iframe>`;
  }

  if (suffix === 'bookmark') {
    const bookmarkUrl = `https://b.hatena.ne.jp/entry/${url.replace(/^https?:\/\//, '')}`;
    return `<a href="${escapeHtml(bookmarkUrl)}">${escapeHtml(url)}</a>`;
  }

  const label = customTitle || url;
  return `<a href="${escapeHtml(url)}">${escapeHtml(label)}</a>`;
}

/**
 * はてなリンク記法を Markdown リンクへ変換する
 */
export function hatenaLinkToMarkdown(syntax: string): string {
  const match =
    /^\[(https?:\/\/[^\s\]]+?)(?::(title(?:=([^\]]+))?|bookmark|embed))?\]$/.exec(
      syntax.trim(),
    );
  if (!match?.[1]) return syntax;

  const url = match[1];
  const customTitle = match[3];
  if (customTitle) {
    return `[${customTitle}](${url})`;
  }
  return url;
}

/**
 * リッチエディタ（Tiptap/Markdown）等によって自動エスケープされたはてな記法の角括弧や記号を復元する
 */
export function unescapeHatenaSyntax(content?: string | null): string {
  if (!content) return '';

  let result = content;

  result = result.replace(
    /<div\s+data-toc-card[^>]*>[\s\S]*?<\/div>/gi,
    '[:contents]',
  );
  result = result.replace(
    /<div\s+data-more-divider[^>]*>[\s\S]*?<\/div>/gi,
    '<!--more-->',
  );
  result = result.replace(
    /!+\[(f:id:[a-zA-Z0-9_-]+:[^\]\n]+?)\](?:\([^)\n]+\))+/g,
    '[$1]',
  );

  result = result.replace(/\\\[:contents\\\]/g, '[:contents]');
  result = result.replace(/\\\[(f:id:[a-zA-Z0-9_-]+:[^\]\n]+?)\\\]/g, '[$1]');
  result = result.replace(/\\\[(youtube:[a-zA-Z0-9_-]+)\\\]/g, '[$1]');
  result = result.replace(/\\\[(twitter:\d+)\\\]/g, '[$1]');
  result = result.replace(
    /\\\[(asin:[a-zA-Z0-9]{10}(?::(?:detail|image|title))?)\\\]/g,
    '[$1]',
  );
  result = result.replace(/\\\[(https?:\/\/[^\s\]\n]+?)\\\]/g, '[$1]');

  result = result.replaceAll('\\|', '|');
  result = result.replaceAll('\\>', '>');
  result = result.replaceAll('\\<', '<');

  return result;
}
