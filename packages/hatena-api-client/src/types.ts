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
