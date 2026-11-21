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

export interface HatenaRetryOptions {
  /** 最大リトライ回数（デフォルト: 0） */
  maxRetries?: number;
  /** 初回待機時間（ミリ秒、デフォルト: 500） */
  baseDelayMs?: number;
  /** 最大待機時間（ミリ秒、デフォルト: 10000） */
  maxDelayMs?: number;
}

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
  /** リトライ設定（429 / 5xx / 一時通信エラー向け） */
  retry?: HatenaRetryOptions | false;
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
  /** リクエスト単位のリトライ設定（false で無効化） */
  retry?: HatenaRetryOptions | false;
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
  formattedContent: string | null;
  summary: string | null;
  author: string | null;
  format: HatenaBlogFormat;
  status: HatenaBlogEntryStatus;
  externalUrl: string | null;
  previewUrl: string | null;
  editUrl: string | null;
  customUrl: string | null;
  categories: string[];
  publishedAt: Date;
  updatedAt: Date | null;
  editedAt: Date | null;
}

/**
 * はてなブログの一覧フィード結果
 */
export interface HatenaBlogFeed {
  title: string | null;
  blogUrl: string | null;
  nextUrl: string | null;
  entries: HatenaBlogEntry[];
}

/**
 * はてなブログ AtomPub サービス文書内のコレクション定義
 */
export interface HatenaBlogCollection {
  href: string;
  title: string | null;
  accepts: string[];
  categoriesHref: string | null;
}

/**
 * はてなブログ AtomPub サービス文書
 */
export interface HatenaBlogServiceDocument {
  workspaceTitle: string | null;
  collections: HatenaBlogCollection[];
}

/**
 * はてなブログ oEmbed API レスポンス
 */
export interface HatenaBlogOEmbed {
  version: string;
  type: string;
  title: string;
  url: string;
  description: string;
  html: string;
  width: string;
  height: string;
  imageUrl: string | null;
  categories: string[];
  blogTitle: string;
  blogUrl: string;
  authorName: string;
  authorUrl: string;
  providerName: string;
  providerUrl: string;
  published: string;
}

/**
 * fetchHatenaBlogOEmbed オプション
 */
export interface FetchHatenaBlogOEmbedOptions {
  timeoutMs?: number;
  fetch?: typeof globalThis.fetch;
}

/**
 * 公開はてなブログフィードの形式
 */
export type HatenaBlogPublicFeedFormat = 'rss' | 'atom';

/**
 * 公開はてなブログフィードの記事アイテム
 */
export interface HatenaBlogPublicFeedItem {
  title: string;
  url: string;
  description: string;
  content: string | null;
  author: string | null;
  categories: string[];
  publishedAt: Date | null;
  updatedAt: Date | null;
}

/**
 * 公開はてなブログフィードレスポンス
 */
export interface HatenaBlogPublicFeed {
  format: HatenaBlogPublicFeedFormat;
  title: string | null;
  description: string | null;
  blogUrl: string | null;
  items: HatenaBlogPublicFeedItem[];
}

/**
 * fetchHatenaBlogPublicFeed オプション
 */
export interface FetchHatenaBlogPublicFeedOptions {
  format?: HatenaBlogPublicFeedFormat;
  timeoutMs?: number;
  fetch?: typeof globalThis.fetch;
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
 * 記事・固定ページのページネーション自動巡回オプション
 */
export interface IterateHatenaBlogEntriesOptions
  extends GetHatenaBlogEntriesOptions {
  /** 取得する最大ページ数（デフォルト: 200） */
  maxPages?: number;
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
  user?: string;
  private?: boolean;
  createdDatetime?: string;
  createdEpoch?: number;
  permalink?: string;
}

/**
 * はてなブックマーク作成・更新オプション
 */
export interface AddHatenaBookmarkOptions {
  url: string;
  comment?: string;
  tags?: string[];
  /** 非公開ブックマークにするかどうか */
  private?: boolean;
  /** Twitter へ共有するかどうか */
  postTwitter?: boolean;
  /** Evernote へ共有するかどうか */
  postEvernote?: boolean;
  /** mixi チェックへ共有するかどうか */
  postMixi?: boolean;
}

/**
 * はてなブックマーク エントリー情報（GET /rest/1/entry）
 */
export interface HatenaBookmarkEntry {
  title: string;
  url: string;
  entryUrl: string;
  count: number;
  faviconUrl: string;
  smartphoneAppEntryUrl: string;
}

/**
 * はてなブックマーク ユーザー情報（GET /rest/1/my）
 */
export interface HatenaBookmarkUserInfo {
  name: string;
  plususer: boolean;
  private: boolean;
  isOAuthTwitter: boolean;
  isOAuthEvernote: boolean;
  isOAuthFacebook: boolean;
  isOAuthMixiCheck: boolean;
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
 * はてなブックマーク公開 API 呼び出しオプション
 */
export interface HatenaBookmarkPublicFetchOptions {
  timeoutMs?: number;
  fetch?: typeof globalThis.fetch;
}

/**
 * はてなブックマーク エントリー情報内の個別ブックマークコメント
 */
export interface HatenaBookmarkPublicComment {
  user: string;
  tags: string[];
  timestamp: string;
  comment: string;
}

/**
 * はてなブックマーク 関連エントリー情報
 */
export interface HatenaBookmarkRelatedEntry {
  title: string;
  count: number;
  url: string;
  entryUrl: string;
  eid: string;
}

/**
 * はてなブックマーク エントリー情報（/entry/json, /entry/jsonlite）
 */
export interface HatenaBookmarkPublicEntry {
  title: string;
  count: number;
  url: string;
  entryUrl: string;
  screenshot: string;
  eid: string;
  bookmarks: HatenaBookmarkPublicComment[];
  related?: HatenaBookmarkRelatedEntry[];
}

/**
 * マイブックマーク全文検索オプション
 */
export interface HatenaBookmarkSearchOptions {
  q: string;
  of?: number;
  limit?: number;
}

/**
 * マイブックマーク全文検索ヒットアイテム
 */
export interface HatenaBookmarkSearchBookmark {
  title: string;
  url: string;
  count: number;
  eid: string;
  comment: string;
  tags: string[];
  timestamp: number;
  snippet?: string;
}

/**
 * マイブックマーク全文検索レスポンス
 */
export interface HatenaBookmarkSearchResult {
  meta: {
    query: string;
    total: number;
    elapsed: number;
    status: number;
  };
  bookmarks: HatenaBookmarkSearchBookmark[];
}

/**
 * はてなブックマーク コメント oEmbed レスポンス
 */
export interface HatenaBookmarkCommentOEmbed {
  version: string;
  type: string;
  title: string;
  url: string;
  html: string;
  width: string;
  height: string;
  authorName: string;
  authorUrl: string;
  providerName: string;
  providerUrl: string;
}

/**
 * マイブックマーク RSS 取得オプション
 */
export interface GetHatenaBookmarkMyFeedOptions {
  hatenaId?: string;
  page?: number;
  tag?: string;
  q?: string;
  date?: string;
  url?: string;
}

/**
 * お気に入りブックマーク RSS 取得オプション
 */
export interface GetHatenaBookmarkFavoriteFeedOptions {
  hatenaId?: string;
  key: string;
}

/**
 * はてなスター ブログカウント API レスポンス
 */
export interface HatenaStarBlogCount {
  title: string;
  uri: string;
  starCount: number;
  count: Record<string, number>;
}

/**
 * はてなスター 個別スター情報
 */
export interface HatenaStarItem {
  name: string;
  quote: string;
  count: number;
}

/**
 * はてなスター カラースターグループ
 */
export interface HatenaStarColoredGroup {
  color: string;
  stars: HatenaStarItem[];
}

/**
 * はてなスター エントリ情報（/entry.json）
 */
export interface HatenaStarEntry {
  uri: string;
  stars: HatenaStarItem[];
  coloredStars: HatenaStarColoredGroup[];
}

/**
 * はてなスター 画像 API オプション
 */
export interface HatenaStarImageOptions {
  uri: string;
  /** 背景色（#RRGGBB 形式） */
  bg?: string;
  /** 倍サイズ（q=1）を取得するかどうか */
  large?: boolean;
}

/**
 * はてなスター 画像 API レスポンス
 */
export interface HatenaStarCountImageResult {
  url: string;
  contentType: string;
  data: Uint8Array;
  starCounts: Record<string, number>;
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
