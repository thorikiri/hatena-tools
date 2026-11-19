import {
  HatenaApiError,
  isTimeoutError,
  statusToErrorCode,
} from '../errors.js';
import type { HatenaFetchClient } from '../http/fetch-client.js';
import type {
  AddHatenaBookmarkOptions,
  HatenaBookmark,
  HatenaBookmarkHotEntryCategory,
  HatenaBookmarkRssItem,
  HatenaBookmarkTag,
} from '../types.js';
import { parseHatenaBookmarkRssXml } from './bookmark-rss.js';

const BOOKMARK_REST_BASE = 'https://bookmark.hatenaapis.com/rest/1/my';
const DEFAULT_TIMEOUT_MS = 15_000;

const ALLOWED_HOTENTRY_CATEGORIES = new Set<string>([
  'all',
  'general',
  'social',
  'economics',
  'life',
  'knowledge',
  'it',
  'fun',
  'entertainment',
  'game',
]);

interface RawBookmarkResponse {
  url: string;
  comment?: string;
  tags?: string[];
  eid?: string;
  created_datetime?: string;
  permalink?: string;
}

interface RawBookmarkTagsResponse {
  tags?: Array<{ tag: string; count: number }>;
}

export interface HatenaBookmarkClientOptions {
  hatenaId?: string;
  timeoutMs?: number;
  fetch?: typeof globalThis.fetch;
}

function mapRawBookmark(raw: RawBookmarkResponse): HatenaBookmark {
  return {
    url: raw.url,
    comment: raw.comment ?? '',
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    eid: raw.eid,
    createdDatetime: raw.created_datetime,
    permalink: raw.permalink,
  };
}

/**
 * はてなブックマーク API クライアント（REST API & 公開 RSS フィード）
 */
export class HatenaBookmarkClient {
  private readonly defaultHatenaId?: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof globalThis.fetch;

  constructor(
    private readonly http: HatenaFetchClient,
    options: HatenaBookmarkClientOptions = {},
  ) {
    this.defaultHatenaId = options.hatenaId;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = options.fetch ?? globalThis.fetch;
  }

  /**
   * 指定 URL のブックマーク状態を取得する（未登録の場合は null）
   */
  public async get(options: { url: string }): Promise<HatenaBookmark | null> {
    const endpoint = `${BOOKMARK_REST_BASE}/bookmark?url=${encodeURIComponent(options.url)}`;
    try {
      const data = await this.http.requestJson<RawBookmarkResponse>({
        url: endpoint,
        method: 'GET',
      });
      return mapRawBookmark(data);
    } catch (error) {
      if (error instanceof HatenaApiError && error.code === 'NOT_FOUND') {
        return null;
      }
      throw error;
    }
  }

  /**
   * ブックマークを作成・更新する（POST /rest/1/my/bookmark）
   * ※ はてなブックマーク REST API は OAuth 1.0a 認証が必要です
   */
  public async add(options: AddHatenaBookmarkOptions): Promise<HatenaBookmark> {
    const formParams: Record<string, string | string[]> = {
      url: options.url,
    };

    const trimmedComment = options.comment?.trim();
    if (trimmedComment) {
      formParams.comment = trimmedComment;
    }

    const normalizedTags = Array.from(
      new Set((options.tags ?? []).map((t) => t.trim()).filter(Boolean)),
    ).slice(0, 10);
    if (normalizedTags.length > 0) {
      formParams.tags = normalizedTags;
    }

    const data = await this.http.requestJson<RawBookmarkResponse>({
      url: `${BOOKMARK_REST_BASE}/bookmark`,
      method: 'POST',
      formParams,
    });

    return mapRawBookmark(data);
  }

  /**
   * 指定 URL のブックマークを削除する（未登録 404 の場合は正常終了）
   */
  public async delete(options: { url: string }): Promise<void> {
    const endpoint = `${BOOKMARK_REST_BASE}/bookmark?url=${encodeURIComponent(options.url)}`;
    try {
      await this.http.request({
        url: endpoint,
        method: 'DELETE',
      });
    } catch (error) {
      if (error instanceof HatenaApiError && error.code === 'NOT_FOUND') {
        return;
      }
      throw error;
    }
  }

  /**
   * 認証済みユーザーのブックマークタグ一覧を取得する
   */
  public async getTags(): Promise<HatenaBookmarkTag[]> {
    const data = await this.http.requestJson<RawBookmarkTagsResponse>({
      url: `${BOOKMARK_REST_BASE}/tags`,
      method: 'GET',
    });
    return Array.isArray(data.tags) ? data.tags : [];
  }

  /**
   * ユーザーの公開ブックマーク RSS 1.0 フィードを取得する
   */
  public async getMyFeed(options?: {
    hatenaId?: string;
  }): Promise<HatenaBookmarkRssItem[]> {
    const hatenaId = (options?.hatenaId ?? this.defaultHatenaId ?? '').trim();
    if (!hatenaId) {
      throw new HatenaApiError(
        'hatenaId が指定されていません。HatenaClient の初期化時またはメソッド引数で指定してください。',
        { code: 'API_ERROR' },
      );
    }

    const rssUrl = `https://b.hatena.ne.jp/${encodeURIComponent(hatenaId)}/rss`;
    const xml = await this.fetchPublicText(rssUrl);
    return parseHatenaBookmarkRssXml(xml);
  }

  /**
   * ホットエントリーの公開 RSS 1.0 フィードを取得する
   */
  public async getHotEntries(options?: {
    category?: HatenaBookmarkHotEntryCategory;
  }): Promise<HatenaBookmarkRssItem[]> {
    const category = options?.category?.trim().toLowerCase();
    let rssUrl = 'https://b.hatena.ne.jp/hotentry.rss';
    if (
      category &&
      category !== 'all' &&
      ALLOWED_HOTENTRY_CATEGORIES.has(category)
    ) {
      rssUrl = `https://b.hatena.ne.jp/hotentry/${encodeURIComponent(category)}.rss`;
    }

    const xml = await this.fetchPublicText(rssUrl);
    return parseHatenaBookmarkRssXml(xml);
  }

  private async fetchPublicText(url: string): Promise<string> {
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: 'GET',
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      if (isTimeoutError(error)) {
        throw new HatenaApiError(
          'はてなブックマーク RSS への接続がタイムアウトしました',
          { code: 'TIMEOUT', cause: error },
        );
      }
      throw new HatenaApiError(
        'はてなブックマーク RSS への通信に失敗しました',
        { code: 'NETWORK_ERROR', cause: error },
      );
    }

    const text = await response.text();
    if (!response.ok) {
      throw new HatenaApiError(
        `はてなブックマーク RSS がエラーを返しました (HTTP ${response.status})`,
        {
          code: statusToErrorCode(response.status),
          status: response.status,
          responseBody: text,
        },
      );
    }

    return text;
  }
}
