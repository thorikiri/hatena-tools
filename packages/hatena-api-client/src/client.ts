import { HatenaFetchClient } from './http/fetch-client.js';
import { HatenaBlogClient } from './services/blog.js';
import { HatenaBookmarkClient } from './services/bookmark.js';
import { HatenaFotolifeClient } from './services/fotolife.js';
import { HatenaUserClient } from './services/user.js';
import type { HatenaClientOptions, HatenaRequestOptions } from './types.js';

/**
 * はてな各種サービス API を統合するクライアント
 */
export class HatenaClient {
  private readonly http: HatenaFetchClient;

  /** ユーザー情報 API クライアント */
  public readonly user: HatenaUserClient;

  /** はてなブログ AtomPub API クライアント */
  public readonly blog: HatenaBlogClient;

  /** はてなブックマーク API クライアント */
  public readonly bookmark: HatenaBookmarkClient;

  /** はてなフォトライフ AtomPub API クライアント */
  public readonly fotolife: HatenaFotolifeClient;

  constructor(options: HatenaClientOptions) {
    this.http = new HatenaFetchClient(options);
    const defaultHatenaId =
      options.hatenaId ??
      (options.auth.type === 'wsse' ? options.auth.hatenaId : undefined);
    this.user = new HatenaUserClient(this.http, {
      hatenaId: defaultHatenaId,
      timeoutMs: options.timeoutMs,
      fetch: options.fetch,
    });
    this.blog = new HatenaBlogClient(this.http, {
      hatenaId: defaultHatenaId,
      blogId: options.blogId,
    });
    this.bookmark = new HatenaBookmarkClient(this.http, {
      hatenaId: defaultHatenaId,
      timeoutMs: options.timeoutMs,
      fetch: options.fetch,
    });
    this.fotolife = new HatenaFotolifeClient(this.http);
  }

  /**
   * 認証ヘッダーを付与して任意の HTTP リクエストを実行する
   */
  public request(options: HatenaRequestOptions): Promise<Response> {
    return this.http.request(options);
  }

  /**
   * 認証ヘッダーを付与して HTTP リクエストを実行し、テキストを取得する
   */
  public requestText(options: HatenaRequestOptions): Promise<string> {
    return this.http.requestText(options);
  }

  /**
   * 認証ヘッダーを付与して HTTP リクエストを実行し、JSON を取得する
   */
  public requestJson<T>(options: HatenaRequestOptions): Promise<T> {
    return this.http.requestJson<T>(options);
  }
}
