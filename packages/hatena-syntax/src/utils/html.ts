/**
 * HTML 特殊文字をエスケープする（XSS 対策）
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * 基本的な HTML エンティティをアンエスケープする
 */
export function unescapeHtml(value: string): string {
  return value.replace(
    /&(#x[0-9a-fA-F]+|#[0-9]+|lt|gt|amp|quot|#39|apos|nbsp);/g,
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
        case '#39':
        case 'apos':
          return "'";
        case 'nbsp':
          return ' ';
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

/**
 * HTML タグを除去してプレーンテキストにする
 */
export function stripHtmlTags(html: string): string {
  return unescapeHtml(html.replace(/<[^>]+>/g, ''));
}
