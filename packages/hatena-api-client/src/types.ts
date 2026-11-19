/**
 * OAuth 1.0a 認証情報
 */
export interface HatenaOAuth1Credentials {
  type: 'oauth1';
  consumerKey: string;
  consumerSecret: string;
  accessToken: string;
  accessSecret: string;
}

/**
 * WSSE 認証情報
 */
export interface HatenaWsseCredentials {
  type: 'wsse';
  hatenaId: string;
  apiKey: string;
}

/**
 * HatenaClient が受け付ける認証設定
 */
export type HatenaAuthConfig = HatenaOAuth1Credentials | HatenaWsseCredentials;

/**
 * HatenaClient の初期化オプション
 */
export interface HatenaClientOptions {
  /** 認証設定（OAuth 1.0a または WSSE） */
  auth: HatenaAuthConfig;
  /** デフォルトのはてなID（WSSEの場合はauth.hatenaIdをフォールバックとして使用） */
  hatenaId?: string;
  /** デフォルトのはてなブログID（例: example.hatenablog.com） */
  blogId?: string;
  /** デフォルトのタイムアウト時間（ミリ秒）。デフォルトは 15000ms */
  timeoutMs?: number;
  /** カスタム fetch 実装（テストや特殊ランタイム向け） */
  fetch?: typeof globalThis.fetch;
}

/**
 * HTTP リクエストメソッド
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

/**
 * 低レベル HTTP リクエストオプション
 */
export interface HatenaRequestOptions {
  /** リクエスト先 URL */
  url: string;
  /** HTTP メソッド */
  method: HttpMethod;
  /** 追加ヘッダー */
  headers?: Record<string, string>;
  /** リクエストボディ */
  body?: string | Uint8Array | ArrayBuffer;
  /** Form URL Encoded パラメータ（OAuth 1.0a 署名対象となる） */
  formParams?: Record<string, string | string[]>;
  /** 個別のタイムアウト時間（ミリ秒） */
  timeoutMs?: number;
  /** キャンセル用 AbortSignal */
  signal?: AbortSignal;
}

/**
 * はてな OAuth 1.0a のスコープ
 */
export type HatenaOAuthScope =
  | 'read_public'
  | 'write_public'
  | 'read_private'
  | 'write_private';

/**
 * はてなユーザー情報（GET https://n.hatena.com/applications/my.json）
 */
export interface HatenaUser {
  /** はてなID（url_name） */
  urlName: string;
  /** 表示名（display_name） */
  displayName: string;
}

/**
 * はてなブログの記事フォーマット
 */
export type HatenaBlogFormat = 'markdown' | 'html' | 'hatena';

/**
 * はてなブログのエントリ種別
 */
export type HatenaBlogEntryType = 'post' | 'page';

/**
 * はてなブログの公開状態
 */
export type HatenaBlogEntryStatus = 'published' | 'draft' | 'scheduled';

/**
 * はてなブログの記事 / 固定ページ情報
 */
export interface HatenaBlogEntry {
  entryId: string;
  type: HatenaBlogEntryType;
  title: string;
  content: string;
  format: HatenaBlogFormat;
  status: HatenaBlogEntryStatus;
  externalUrl: string | null;
  previewUrl: string | null;
  editUrl: string | null;
  customUrl: string | null;
  categories: string[];
  publishedAt: Date;
}

/**
 * はてなブログの一覧フィード結果
 */
export interface HatenaBlogFeed {
  nextUrl: string | null;
  entries: HatenaBlogEntry[];
}

/**
 * Atom Entry XML ビルドオプション
 */
export interface BuildHatenaEntryXmlOptions {
  title: string;
  content: string;
  format?: HatenaBlogFormat;
  categories?: string[];
  updated?: Date;
  draft?: boolean;
  scheduled?: boolean;
  preview?: boolean;
  customUrl?: string | null;
}

/**
 * はてなブログ API 呼び出し時の共通ターゲット指定
 */
export interface HatenaBlogTargetOptions {
  hatenaId?: string;
  blogId?: string;
}

/**
 * 記事・固定ページ一覧取得オプション
 */
export interface GetHatenaBlogEntriesOptions extends HatenaBlogTargetOptions {
  nextUrl?: string | null;
}

/**
 * 記事・固定ページ作成オプション
 */
export interface CreateHatenaBlogEntryOptions
  extends HatenaBlogTargetOptions,
    BuildHatenaEntryXmlOptions {}

/**
 * 記事更新オプション
 */
export interface UpdateHatenaBlogEntryOptions
  extends CreateHatenaBlogEntryOptions {
  entryId: string;
}

/**
 * 固定ページ更新オプション
 */
export interface UpdateHatenaBlogPageOptions
  extends CreateHatenaBlogEntryOptions {
  pageId: string;
}

/**
 * はてなブックマーク情報（REST API）
 */
export interface HatenaBookmark {
  url: string;
  comment: string;
  tags: string[];
  eid?: string;
  createdDatetime?: string;
  permalink?: string;
}

/**
 * はてなブックマーク作成・更新オプション
 */
export interface AddHatenaBookmarkOptions {
  url: string;
  comment?: string;
  tags?: string[];
}

/**
 * はてなブックマークのタグ情報
 */
export interface HatenaBookmarkTag {
  tag: string;
  count: number;
}

/**
 * はてなブックマーク ホットエントリーのカテゴリ
 */
export type HatenaBookmarkHotEntryCategory =
  | 'all'
  | 'general'
  | 'social'
  | 'economics'
  | 'life'
  | 'knowledge'
  | 'it'
  | 'fun'
  | 'entertainment'
  | 'game';

/**
 * はてなブックマーク RSS 1.0 (RDF) アイテム
 */
export interface HatenaBookmarkRssItem {
  title: string;
  url: string;
  comment: string;
  tags: string[];
  bookmarkCount?: number;
  date: Date;
}

/**
 * はてなフォトライフの写真情報
 */
export interface HatenaFotolifePhoto {
  photoId: string;
  title: string;
  imageUrl: string | null;
  imageUrlSmall: string | null;
  pageUrl: string | null;
  syntax: string | null;
  editUrl: string | null;
  hatenaUser: string | null;
  issued: Date | null;
}

/**
 * はてなフォトライフの写真一覧フィード結果
 */
export interface HatenaFotolifeFeed {
  hatenaUser: string | null;
  photos: HatenaFotolifePhoto[];
}

/**
 * はてなフォトライフ画像アップロードオプション
 */
export interface UploadFotolifePhotoOptions {
  /** 画像バイナリ（Node.js の Buffer も Uint8Array として渡せます） */
  file: Uint8Array | ArrayBuffer;
  /** 画像タイトル（ファイル名など） */
  title: string;
  /** MIME タイプ（デフォルト: "image/jpeg"） */
  contentType?: string;
  /** 保存先フォルダ名（<dc:subject>） */
  folder?: string;
  /** アップロードツール名（<generator>） */
  generator?: string;
}

/**
 * はてなフォトライフ画像更新オプション
 */
export interface UpdateFotolifePhotoOptions {
  /** 変更後の画像タイトル */
  title: string;
}

/**
 * はてなフォトライフ画像削除オプション
 */
export interface DeleteFotolifePhotoOptions {
  photoId?: string;
  editUrl?: string;
  syntax?: string;
  imageUrl?: string;
}

/**
 * はてなプロフィール画像のサイズ
 */
export type HatenaProfileImageSize = 64 | 128 | 256 | 512;

/**
 * はてなプロフィール画像取得オプション
 */
export interface GetHatenaProfileImageOptions {
  hatenaId?: string;
  size?: HatenaProfileImageSize;
}

/**
 * はてなプロフィール画像ダウンロード結果
 */
export interface HatenaProfileImageResult {
  url: string;
  contentType: string;
  data: Uint8Array;
}
