import {
  buildOAuth1AuthorizationHeader,
  serializeFormParams,
} from '../auth/oauth1.js';
import { buildWsseHeader } from '../auth/wsse.js';
import {
  HatenaApiError,
  isTimeoutError,
  statusToErrorCode,
} from '../errors.js';
import type {
  HatenaAuthConfig,
  HatenaClientOptions,
  HatenaRequestOptions,
} from '../types.js';

const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * Web 標準 fetch をベースとした共通 HTTP クライアント
 */
export class HatenaFetchClient {
  private readonly auth: HatenaAuthConfig;
  private readonly defaultTimeoutMs: number;
  private readonly fetchImpl: typeof globalThis.fetch;

  constructor(options: HatenaClientOptions) {
    this.auth = options.auth;
    this.defaultTimeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = options.fetch ?? globalThis.fetch;
  }

  /**
   * 認証ヘッダーを付与して HTTP リクエストを実行する
   */
  public async request(options: HatenaRequestOptions): Promise<Response> {
    const headers: Record<string, string> = {
      ...options.headers,
    };

    let body: RequestInit['body'];
    if (options.formParams) {
      body = serializeFormParams(options.formParams);
      if (!headers['Content-Type'] && !headers['content-type']) {
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
      }
    } else if (options.body !== undefined) {
      body =
        options.body instanceof Uint8Array
          ? new Uint8Array(options.body)
          : options.body;
    }

    if (this.auth.type === 'oauth1') {
      headers.Authorization = await buildOAuth1AuthorizationHeader({
        url: options.url,
        method: options.method,
        consumerKey: this.auth.consumerKey,
        consumerSecret: this.auth.consumerSecret,
        token: this.auth.accessToken,
        tokenSecret: this.auth.accessSecret,
        formParams: options.formParams,
      });
    } else {
      headers['X-WSSE'] = await buildWsseHeader(
        this.auth.hatenaId,
        this.auth.apiKey,
      );
    }

    const timeoutSignal = AbortSignal.timeout(
      options.timeoutMs ?? this.defaultTimeoutMs,
    );
    const signal = options.signal
      ? AbortSignal.any([options.signal, timeoutSignal])
      : timeoutSignal;

    let response: Response;
    try {
      response = await this.fetchImpl(options.url, {
        method: options.method,
        headers,
        body,
        signal,
      });
    } catch (error) {
      if (isTimeoutError(error)) {
        throw new HatenaApiError('はてなAPIへの接続がタイムアウトしました', {
          code: 'TIMEOUT',
          cause: error,
        });
      }
      throw new HatenaApiError('はてなAPIへの通信に失敗しました', {
        code: 'NETWORK_ERROR',
        cause: error,
      });
    }

    if (!response.ok) {
      const responseBody = await response.text().catch(() => undefined);
      throw new HatenaApiError(
        `はてなAPIがエラーを返しました (HTTP ${response.status})`,
        {
          code: statusToErrorCode(response.status),
          status: response.status,
          responseBody,
        },
      );
    }

    return response;
  }

  /**
   * レスポンスボディをテキストとして取得する
   */
  public async requestText(options: HatenaRequestOptions): Promise<string> {
    const response = await this.request(options);
    return response.text();
  }

  /**
   * レスポンスボディを JSON として取得する
   */
  public async requestJson<T>(options: HatenaRequestOptions): Promise<T> {
    const response = await this.request(options);
    return (await response.json()) as T;
  }
}
