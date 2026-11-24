/**
 * はてなフォトライフ記法のパース結果
 */
export interface HatenaPhotoInfo {
  user: string;
  date: string;
  time: string;
  extCode: string;
  ext: string;
  photoId: string;
  options: string;
  title?: string;
  alt?: string;
  imageUrl: string;
  syntax: string;
}

/**
 * インライン AST ノード
 */
export type HatenaInlineNode =
  | { type: 'text'; value: string }
  | { type: 'bold'; children: HatenaInlineNode[] }
  | { type: 'italic'; children: HatenaInlineNode[] }
  | { type: 'strike'; children: HatenaInlineNode[] }
  | { type: 'code'; value: string }
  | {
      type: 'link';
      url: string;
      title?: string;
      mode: 'plain' | 'title' | 'bookmark' | 'embed';
    }
  | ({ type: 'photo' } & HatenaPhotoInfo)
  | {
      type: 'embed';
      provider:
        | 'youtube'
        | 'twitter'
        | 'asin'
        | 'isbn'
        | 'hatenaId'
        | 'question'
        | 'google';
      id: string;
      option?: string;
    }
  | { type: 'tex'; value: string; syntax: 'tex' | 'dollar' }
  | { type: 'footnote'; id: number; children: HatenaInlineNode[] };

/**
 * リストアイテム
 */
export interface HatenaListItem {
  children: HatenaInlineNode[];
  subLists: HatenaListBlock[];
}

/**
 * リストブロック
 */
export interface HatenaListBlock {
  type: 'list';
  ordered: boolean;
  items: HatenaListItem[];
}

/**
 * 定義リストアイテム
 */
export interface HatenaDefinitionItem {
  term: HatenaInlineNode[];
  description: HatenaInlineNode[];
}

/**
 * テーブルセル
 */
export interface HatenaTableCell {
  header: boolean;
  children: HatenaInlineNode[];
}

/**
 * 見出しレベル（HTML h1〜h6 / Markdown #〜###### との相互変換を考慮し 1〜6 をサポート）
 */
export type HatenaHeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

/**
 * ブロック AST ノード
 */
export type HatenaBlockNode =
  | {
      type: 'heading';
      level: HatenaHeadingLevel;
      children: HatenaInlineNode[];
    }
  | { type: 'paragraph'; children: HatenaInlineNode[] }
  | HatenaListBlock
  | { type: 'definitionList'; items: HatenaDefinitionItem[] }
  | { type: 'table'; rows: HatenaTableCell[][] }
  | {
      type: 'blockquote';
      citeUrl?: string;
      citeTitle?: string;
      children: HatenaBlockNode[];
    }
  | { type: 'codeBlock'; lang: string; code: string }
  | { type: 'pre'; children: HatenaInlineNode[] }
  | { type: 'raw'; value: string }
  | { type: 'toc' }
  | { type: 'more'; label?: string; super?: boolean }
  | { type: 'hr' }
  | { type: 'br' }
  | { type: 'comment'; value: string };

/**
 * 脚注定義
 */
export interface HatenaFootnoteDefinition {
  id: number;
  children: HatenaInlineNode[];
}

/**
 * はてな記法ドキュメントルート AST
 */
export interface HatenaDocument {
  type: 'document';
  blocks: HatenaBlockNode[];
  footnotes: HatenaFootnoteDefinition[];
}

/**
 * parseHatena オプション
 */
export interface ParseHatenaOptions {
  /** 裸の URL を自動的にリンクノードとして扱うか（デフォルト: true） */
  autoLink?: boolean;
}
