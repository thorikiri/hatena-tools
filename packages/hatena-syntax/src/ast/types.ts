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
      provider: 'youtube' | 'twitter' | 'asin';
      id: string;
      option?: string;
    }
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
  | {
      type: 'blockquote';
      citeUrl?: string;
      citeTitle?: string;
      children: HatenaBlockNode[];
    }
  | { type: 'codeBlock'; lang: string; code: string }
  | { type: 'toc' }
  | { type: 'more'; label?: string }
  | { type: 'hr' };

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
