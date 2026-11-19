import {
  HatenaApiError,
  isTimeoutError,
  statusToErrorCode,
} from '../errors.js';
import type { HatenaOAuthScope, HttpMethod } from '../types.js';
import { uint8ArrayToBase64 } from './wsse.js';

const REQUEST_TOKEN_URL = 'https://www.hatena.com/oauth/initiate';
const ACCESS_TOKEN_URL = 'https://www.hatena.com/oauth/token';
const AUTHORIZE_URL = 'https://www.hatena.ne.jp/oauth/authorize';
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_SCOPES: readonly HatenaOAuthScope[] = [
  'read_public',
  'write_public',
  'read_private',
  'write_private',
];

/**
 * RFC 5849 準拠のパーセントエンコーディング
 */
export function percentEncode(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/**
 * フォームパラメータを application/x-www-form-urlencoded 形式にシリアライズする
 */
export function serializeFormParams(
  params: Record<string, string | string[]>,
): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(item)}`);
      }
    } else {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
    }
  }
  return parts.join('&');
}

/**
 * HMAC-SHA1 署名を計算して Base64 文字列で返す（Web Crypto API 使用）
 */
async function signHmacSha1(
  baseString: string,
  signingKey: string,
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(signingKey),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(baseString),
  );
  return uint8ArrayToBase64(new Uint8Array(signature));
}

/**
 * OAuth 1.0a 署名ベース文字列用のパラメータ正規化
 */
function buildNormalizedParams(
  url: URL,
  oauthParams: Record<string, string>,
  formParams?: Record<string, string | string[]>,
): string {
  const pairs: Array<[string, string]> = [];

  for (const [key, value] of url.searchParams.entries()) {
    pairs.push([percentEncode(key), percentEncode(value)]);
  }

  for (const [key, value] of Object.entries(oauthParams)) {
    pairs.push([percentEncode(key), percentEncode(value)]);
  }

  if (formParams) {
    for (const [key, value] of Object.entries(formParams)) {
      if (Array.isArray(value)) {
        for (const item of value) {
          pairs.push([percentEncode(key), percentEncode(item)]);
        }
      } else {
        pairs.push([percentEncode(key), percentEncode(value)]);
      }
    }
  }

  pairs.sort((a, b) => {
    if (a[0] !== b[0]) return a[0] < b[0] ? -1 : 1;
    if (a[1] !== b[1]) return a[1] < b[1] ? -1 : 1;
    return 0;
  });

  return pairs.map(([k, v]) => `${k}=${v}`).join('&');
}

/**
 * OAuth 1.0a Authorization ヘッダー生成パラメータ
 */
export interface BuildOAuth1HeaderParams {
  url: string;
  method: HttpMethod;
  consumerKey: string;
  consumerSecret: string;
  token?: string;
  tokenSecret?: string;
  callback?: string;
  verifier?: string;
  formParams?: Record<string, string | string[]>;
  /** テスト用固定値 */
  nonce?: string;
  /** テスト用固定タイムスタンプ（秒） */
  timestamp?: string;
}

/**
 * RFC 5849 準拠の OAuth 1.0a Authorization ヘッダーを生成する
 */
export async function buildOAuth1AuthorizationHeader(
  params: BuildOAuth1HeaderParams,
): Promise<string> {
  const parsedUrl = new URL(params.url);
  const baseUrl = `${parsedUrl.protocol}//${parsedUrl.host}${parsedUrl.pathname}`;
  const nonce = params.nonce ?? crypto.randomUUID().replace(/-/g, '');
  const timestamp =
    params.timestamp ?? Math.floor(Date.now() / 1000).toString();

  const oauthParams: Record<string, string> = {
    oauth_consumer_key: params.consumerKey,
    oauth_nonce: nonce,
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: timestamp,
    oauth_version: '1.0',
  };

  if (params.token !== undefined) {
    oauthParams.oauth_token = params.token;
  }
  if (params.callback !== undefined) {
    oauthParams.oauth_callback = params.callback;
  }
  if (params.verifier !== undefined) {
    oauthParams.oauth_verifier = params.verifier;
  }

  const normalizedParams = buildNormalizedParams(
    parsedUrl,
    oauthParams,
    params.formParams,
  );
  const baseString = [
    params.method.toUpperCase(),
    percentEncode(baseUrl),
    percentEncode(normalizedParams),
  ].join('&');

  const signingKey = `${percentEncode(params.consumerSecret)}&${percentEncode(params.tokenSecret ?? '')}`;
  const signature = await signHmacSha1(baseString, signingKey);

  const headerParams: Record<string, string> = {
    ...oauthParams,
    oauth_signature: signature,
  };

  const headerEntries = Object.keys(headerParams)
    .sort()
    .map(
      (key) =>
        `${percentEncode(key)}="${percentEncode(headerParams[key] ?? '')}"`,
    );

  return `OAuth ${headerEntries.join(', ')}`;
}

/**
 * HatenaOAuth1 初期化オプション
 */
export interface HatenaOAuth1Options {
  consumerKey: string;
  consumerSecret: string;
  timeoutMs?: number;
  fetch?: typeof globalThis.fetch;
}

/**
 * Request Token 取得オプション
 */
export interface GetRequestTokenOptions {
  callbackUrl: string;
  scope?: HatenaOAuthScope[];
}

/**
 * Request Token 取得結果
 */
export interface GetRequestTokenResult {
  token: string;
  secret: string;
  callbackConfirmed: boolean;
  authorizeUrl: string;
}

/**
 * Access Token 取得オプション
 */
export interface GetAccessTokenOptions {
  token: string;
  secret: string;
  verifier: string;
}

/**
 * Access Token 取得結果
 */
export interface GetAccessTokenResult {
  accessToken: string;
  accessSecret: string;
  urlName: string | null;
  displayName: string | null;
}

/**
 * はてな OAuth 1.0a 3-legged 認証フローを提供するクラス
 */
export class HatenaOAuth1 {
  private readonly consumerKey: string;
  private readonly consumerSecret: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof globalThis.fetch;

  constructor(options: HatenaOAuth1Options) {
    this.consumerKey = options.consumerKey;
    this.consumerSecret = options.consumerSecret;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = options.fetch ?? globalThis.fetch;
  }

  /**
   * 認可URLを生成する
   */
  public getAuthorizeUrl(requestToken: string): string {
    return `${AUTHORIZE_URL}?oauth_token=${encodeURIComponent(requestToken)}`;
  }

  /**
   * Request Token を取得する（POST https://www.hatena.com/oauth/initiate）
   */
  public async getRequestToken(
    options: GetRequestTokenOptions,
  ): Promise<GetRequestTokenResult> {
    const scopes = options.scope?.length ? options.scope : DEFAULT_SCOPES;
    const formParams = {
      scope: scopes.join(','),
    };

    const authHeader = await buildOAuth1AuthorizationHeader({
      url: REQUEST_TOKEN_URL,
      method: 'POST',
      consumerKey: this.consumerKey,
      consumerSecret: this.consumerSecret,
      callback: options.callbackUrl,
      formParams,
    });

    const bodyText = await this.postForm(
      REQUEST_TOKEN_URL,
      authHeader,
      formParams,
    );
    const params = new URLSearchParams(bodyText);
    const token = params.get('oauth_token');
    const secret = params.get('oauth_token_secret');

    if (!token || !secret) {
      throw new HatenaApiError('OAuth Request Token のレスポンスが不正です', {
        code: 'API_ERROR',
        responseBody: bodyText,
      });
    }

    return {
      token,
      secret,
      callbackConfirmed: params.get('oauth_callback_confirmed') === 'true',
      authorizeUrl: this.getAuthorizeUrl(token),
    };
  }

  /**
   * Access Token を取得する（POST https://www.hatena.com/oauth/token）
   */
  public async getAccessToken(
    options: GetAccessTokenOptions,
  ): Promise<GetAccessTokenResult> {
    const authHeader = await buildOAuth1AuthorizationHeader({
      url: ACCESS_TOKEN_URL,
      method: 'POST',
      consumerKey: this.consumerKey,
      consumerSecret: this.consumerSecret,
      token: options.token,
      tokenSecret: options.secret,
      verifier: options.verifier,
    });

    const bodyText = await this.postForm(ACCESS_TOKEN_URL, authHeader);
    const params = new URLSearchParams(bodyText);
    const accessToken = params.get('oauth_token');
    const accessSecret = params.get('oauth_token_secret');

    if (!accessToken || !accessSecret) {
      throw new HatenaApiError('OAuth Access Token のレスポンスが不正です', {
        code: 'API_ERROR',
        responseBody: bodyText,
      });
    }

    return {
      accessToken,
      accessSecret,
      urlName: params.get('url_name'),
      displayName: params.get('display_name'),
    };
  }

  private async postForm(
    url: string,
    authHeader: string,
    formParams?: Record<string, string>,
  ): Promise<string> {
    const body = formParams ? serializeFormParams(formParams) : undefined;
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: 'POST',
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      if (isTimeoutError(error)) {
        throw new HatenaApiError(
          'はてな OAuth API への接続がタイムアウトしました',
          {
            code: 'TIMEOUT',
            cause: error,
          },
        );
      }
      throw new HatenaApiError('はてな OAuth API への通信に失敗しました', {
        code: 'NETWORK_ERROR',
        cause: error,
      });
    }

    const responseText = await response.text();
    if (!response.ok) {
      throw new HatenaApiError(
        `はてな OAuth API がエラーを返しました (HTTP ${response.status})`,
        {
          code: statusToErrorCode(response.status),
          status: response.status,
          responseBody: responseText,
        },
      );
    }

    return responseText;
  }
}
