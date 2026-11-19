import {
  HatenaApiError,
  isTimeoutError,
  statusToErrorCode,
} from '../errors.js';
import type { HatenaFetchClient } from '../http/fetch-client.js';
import type {
  AddHatenaBookmarkOptions,
  GetHatenaBookmarkFavoriteFeedOptions,
  GetHatenaBookmarkMyFeedOptions,
  HatenaBookmark,
  HatenaBookmarkCommentOEmbed,
  HatenaBookmarkEntry,
  HatenaBookmarkHotEntryCategory,
  HatenaBookmarkPublicEntry,
  HatenaBookmarkPublicFetchOptions,
  HatenaBookmarkRssItem,
  HatenaBookmarkSearchOptions,
  HatenaBookmarkSearchResult,
  HatenaBookmarkTag,
  HatenaBookmarkUserInfo,
} from '../types.js';
import { parseHatenaBookmarkRssXml } from './bookmark-rss.js';

const BOOKMARK_REST_ROOT = 'https://bookmark.hatenaapis.com/rest/1';
const BOOKMARK_REST_BASE = `${BOOKMARK_REST_ROOT}/my`;
const BOOKMARK_COUNT_SINGLE_URL = 'https://bookmark.hatenaapis.com/count/entry';
const BOOKMARK_COUNT_MULTI_URL =
  'https://bookmark.hatenaapis.com/count/entries';
const BOOKMARK_ENTRY_JSON_BASE = 'https://b.hatena.ne.jp/entry/json/';
const BOOKMARK_ENTRY_JSONLITE_BASE = 'https://b.hatena.ne.jp/entry/jsonlite/';
const BOOKMARK_OEMBED_URL = 'https://b.hatena.ne.jp/api/oembed';
const BOOKMARK_SEARCH_URL = 'https://b.hatena.ne.jp/my/search/json';
const MAX_COUNT_URLS = 50;
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
  user?: string;
  private?: unknown;
  created_datetime?: string;
  created_epoch?: number | string;
  permalink?: string;
}

interface RawBookmarkEntryResponse {
  title?: string;
  url?: string;
  entry_url?: string;
  count?: number | string;
  favicon_url?: string;
  smartphone_app_entry_url?: string;
}

interface RawBookmarkUserInfoResponse {
  name?: string;
  plususer?: unknown;
  private?: unknown;
  is_oauth_twitter?: unknown;
  is_oauth_evernote?: unknown;
  is_oauth_facebook?: unknown;
  is_oauth_mixi_check?: unknown;
}

interface RawBookmarkTagsResponse {
  tags?: Array<{ tag: string; count: number }>;
}

interface RawPublicEntryResponse {
  title?: string;
  count?: number | string;
  url?: string;
  entry_url?: string;
  screenshot?: string;
  eid?: string | number;
  bookmarks?: Array<{
    user?: string;
    tags?: string[];
    timestamp?: string;
    comment?: string;
  }>;
  related?: Array<{
    title?: string;
    count?: number | string;
    url?: string;
    entry_url?: string;
    eid?: string | number;
  }>;
}

interface RawCommentOEmbedResponse {
  version?: string;
  type?: string;
  title?: string;
  url?: string;
  html?: string;
  width?: string | number;
  height?: string | number;
  author_name?: string;
  author_url?: string;
  provider_name?: string;
  provider_url?: string;
}

export interface HatenaBookmarkClientOptions {
  hatenaId?: string;
  timeoutMs?: number;
  fetch?: typeof globalThis.fetch;
}

function toHatenaBoolean(value: unknown): boolean {
  return (
    value !== null &&
    value !== undefined &&
    value !== false &&
    value !== 0 &&
    value !== '0'
  );
}

function toOptionalNumber(
  value: number | string | undefined,
): number | undefined {
  if (value === undefined) return undefined;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function mapRawBookmark(raw: RawBookmarkResponse): HatenaBookmark {
  return {
    url: raw.url,
    comment: raw.comment ?? '',
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    eid: raw.eid,
    user: raw.user,
    private:
      raw.private !== undefined ? toHatenaBoolean(raw.private) : undefined,
    createdDatetime: raw.created_datetime,
    createdEpoch: toOptionalNumber(raw.created_epoch),
    permalink: raw.permalink,
  };
}

async function fetchPublicText(
  url: string,
  options?: HatenaBookmarkPublicFetchOptions,
): Promise<string> {
  const fetchImpl = options?.fetch ?? globalThis.fetch;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: 'GET',
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (isTimeoutError(error)) {
      throw new HatenaApiError(
        'はてなブックマーク API への接続がタイムアウトしました',
        { code: 'TIMEOUT', cause: error },
      );
    }
    throw new HatenaApiError('はてなブックマーク API への通信に失敗しました', {
      code: 'NETWORK_ERROR',
      cause: error,
    });
  }

  const text = await response.text();
  if (!response.ok) {
    throw new HatenaApiError(
      `はてなブックマーク API がエラーを返しました (HTTP ${response.status})`,
      {
        code: statusToErrorCode(response.status),
        status: response.status,
        responseBody: text,
      },
    );
  }

  return text;
}

/**
 * 指定 URL のはてなブックマーク件数を取得する（認証不要）
 */
export async function fetchHatenaBookmarkCount(
  url: string,
  options?: HatenaBookmarkPublicFetchOptions,
): Promise<number> {
  const trimmed = url.trim();
  if (!trimmed) {
    throw new HatenaApiError('対象 URL が指定されていません。', {
      code: 'API_ERROR',
    });
  }
  const endpoint = `${BOOKMARK_COUNT_SINGLE_URL}?url=${encodeURIComponent(trimmed)}`;
  const text = await fetchPublicText(endpoint, options);
  const count = Number.parseInt(text.trim(), 10);
  return Number.isNaN(count) ? 0 : count;
}

/**
 * 複数 URL（最大 50 件）のはてなブックマーク件数を一括取得する（認証不要）
 */
export async function fetchHatenaBookmarkCounts(
  urls: string[],
  options?: HatenaBookmarkPublicFetchOptions,
): Promise<Record<string, number>> {
  const normalized = urls.map((u) => u.trim()).filter(Boolean);
  if (normalized.length === 0) {
    return {};
  }
  if (normalized.length > MAX_COUNT_URLS) {
    throw new HatenaApiError(
      `一度に指定できる URL は最大 ${MAX_COUNT_URLS} 件までです。`,
      { code: 'API_ERROR' },
    );
  }

  const query = normalized.map((u) => `url=${encodeURIComponent(u)}`).join('&');
  const endpoint = `${BOOKMARK_COUNT_MULTI_URL}?${query}`;
  const text = await fetchPublicText(endpoint, options);
  return JSON.parse(text) as Record<string, number>;
}

/**
 * 指定 URL のはてなブックマークエントリー情報・コメント一覧を取得する（認証不要）
 */
export async function fetchHatenaBookmarkEntryInfo(
  url: string,
  options?: HatenaBookmarkPublicFetchOptions & { lite?: boolean },
): Promise<HatenaBookmarkPublicEntry | null> {
  const trimmed = url.trim();
  if (!trimmed) {
    throw new HatenaApiError('対象 URL が指定されていません。', {
      code: 'API_ERROR',
    });
  }

  const base = options?.lite
    ? BOOKMARK_ENTRY_JSONLITE_BASE
    : BOOKMARK_ENTRY_JSON_BASE;
  const escapedUrl = trimmed.replace(/#/g, '%23');
  const endpoint = `${base}${escapedUrl}`;

  let text: string;
  try {
    text = await fetchPublicText(endpoint, options);
  } catch (error) {
    if (error instanceof HatenaApiError && error.code === 'NOT_FOUND') {
      return null;
    }
    throw error;
  }

  const parsed = JSON.parse(text) as RawPublicEntryResponse | null;
  if (!parsed) {
    return null;
  }

  return {
    title: parsed.title ?? '',
    count: toOptionalNumber(parsed.count) ?? 0,
    url: parsed.url ?? trimmed,
    entryUrl: parsed.entry_url ?? '',
    screenshot: parsed.screenshot ?? '',
    eid: String(parsed.eid ?? ''),
    bookmarks: Array.isArray(parsed.bookmarks)
      ? parsed.bookmarks.map((b) => ({
          user: b.user ?? '',
          tags: Array.isArray(b.tags) ? b.tags : [],
          timestamp: b.timestamp ?? '',
          comment: b.comment ?? '',
        }))
      : [],
    ...(Array.isArray(parsed.related)
      ? {
          related: parsed.related.map((r) => ({
            title: r.title ?? '',
            count: toOptionalNumber(r.count) ?? 0,
            url: r.url ?? '',
            entryUrl: r.entry_url ?? '',
            eid: String(r.eid ?? ''),
          })),
        }
      : {}),
  };
}

/**
 * はてなブックマークコメントの oEmbed 情報を取得する（認証不要）
 */
export async function fetchHatenaBookmarkCommentOEmbed(
  url: string,
  options?: HatenaBookmarkPublicFetchOptions,
): Promise<HatenaBookmarkCommentOEmbed> {
  const trimmed = url.trim();
  if (!trimmed) {
    throw new HatenaApiError('対象のコメント URL が指定されていません。', {
      code: 'API_ERROR',
    });
  }

  const endpoint = `${BOOKMARK_OEMBED_URL}?url=${encodeURIComponent(trimmed)}&format=json`;
  const text = await fetchPublicText(endpoint, options);
  const data = JSON.parse(text) as RawCommentOEmbedResponse;

  return {
    version: data.version ?? '1.0',
    type: data.type ?? 'rich',
    title: data.title ?? '',
    url: data.url ?? trimmed,
    html: data.html ?? '',
    width: String(data.width ?? '100%'),
    height: String(data.height ?? '160px'),
    authorName: data.author_name ?? '',
    authorUrl: data.author_url ?? '',
    providerName: data.provider_name ?? 'Hatena Bookmark',
    providerUrl: data.provider_url ?? 'https://b.hatena.ne.jp/',
  };
}

/**
 * はてなブックマーク API クライアント（REST API / 公開 API / 検索 / RSS フィード）
 */
export class HatenaBookmarkClient {
  private readonly defaultHatenaId?: string;
  private readonly publicFetchOptions: HatenaBookmarkPublicFetchOptions;

  constructor(
    private readonly http: HatenaFetchClient,
    options: HatenaBookmarkClientOptions = {},
  ) {
    this.defaultHatenaId = options.hatenaId;
    this.publicFetchOptions = {
      timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      fetch: options.fetch,
    };
  }

  private resolveHatenaId(explicit?: string): string {
    const hatenaId = (explicit ?? this.defaultHatenaId ?? '').trim();
    if (!hatenaId) {
      throw new HatenaApiError(
        'hatenaId が指定されていません。HatenaClient の初期化時またはメソッド引数で指定してください。',
        { code: 'API_ERROR' },
      );
    }
    return hatenaId;
  }

  // --- REST API（OAuth 1.0a 認証） ---

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

    if (options.private !== undefined) {
      formParams.private = options.private ? '1' : '0';
    }
    if (options.postTwitter) {
      formParams.post_twitter = '1';
    }
    if (options.postEvernote) {
      formParams.post_evernote = '1';
    }
    if (options.postMixi) {
      formParams.post_mixi_check = '1';
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
   * 指定 URL のエントリー情報を取得する（GET /rest/1/entry）
   */
  public async getEntry(options: {
    url: string;
  }): Promise<HatenaBookmarkEntry | null> {
    const endpoint = `${BOOKMARK_REST_ROOT}/entry?url=${encodeURIComponent(options.url)}`;
    try {
      const data = await this.http.requestJson<RawBookmarkEntryResponse>({
        url: endpoint,
        method: 'GET',
      });
      return {
        title: data.title ?? '',
        url: data.url ?? options.url,
        entryUrl: data.entry_url ?? '',
        count: toOptionalNumber(data.count) ?? 0,
        faviconUrl: data.favicon_url ?? '',
        smartphoneAppEntryUrl: data.smartphone_app_entry_url ?? '',
      };
    } catch (error) {
      if (error instanceof HatenaApiError && error.code === 'NOT_FOUND') {
        return null;
      }
      throw error;
    }
  }

  /**
   * 認証済みユーザーのブックマーク設定情報を取得する（GET /rest/1/my）
   */
  public async getMyInfo(): Promise<HatenaBookmarkUserInfo> {
    const data = await this.http.requestJson<RawBookmarkUserInfoResponse>({
      url: BOOKMARK_REST_BASE,
      method: 'GET',
    });
    return {
      name: data.name ?? '',
      plususer: toHatenaBoolean(data.plususer),
      private: toHatenaBoolean(data.private),
      isOAuthTwitter: toHatenaBoolean(data.is_oauth_twitter),
      isOAuthEvernote: toHatenaBoolean(data.is_oauth_evernote),
      isOAuthFacebook: toHatenaBoolean(data.is_oauth_facebook),
      isOAuthMixiCheck: toHatenaBoolean(data.is_oauth_mixi_check),
    };
  }

  // --- 全文検索 API ---

  /**
   * マイブックマークを全文検索する（GET https://b.hatena.ne.jp/my/search/json）
   */
  public searchMyBookmarks(
    options: HatenaBookmarkSearchOptions,
  ): Promise<HatenaBookmarkSearchResult> {
    const params = new URLSearchParams({ q: options.q });
    if (options.of !== undefined) {
      params.set('of', String(options.of));
    }
    if (options.limit !== undefined) {
      params.set('limit', String(options.limit));
    }

    return this.http.requestJson<HatenaBookmarkSearchResult>({
      url: `${BOOKMARK_SEARCH_URL}?${params.toString()}`,
      method: 'GET',
    });
  }

  // --- 公開 API（認証不要） ---

  /**
   * 指定 URL のブックマーク件数を取得する
   */
  public getCount(options: { url: string }): Promise<number> {
    return fetchHatenaBookmarkCount(options.url, this.publicFetchOptions);
  }

  /**
   * 複数 URL（最大 50 件）のブックマーク件数を一括取得する
   */
  public getCounts(options: {
    urls: string[];
  }): Promise<Record<string, number>> {
    return fetchHatenaBookmarkCounts(options.urls, this.publicFetchOptions);
  }

  /**
   * 指定 URL の公開エントリー情報・コメント一覧を取得する
   */
  public getPublicEntry(options: {
    url: string;
    lite?: boolean;
  }): Promise<HatenaBookmarkPublicEntry | null> {
    return fetchHatenaBookmarkEntryInfo(options.url, {
      ...this.publicFetchOptions,
      lite: options.lite,
    });
  }

  /**
   * ブックマークコメントの oEmbed 情報を取得する
   */
  public getCommentOEmbed(options: {
    url: string;
  }): Promise<HatenaBookmarkCommentOEmbed> {
    return fetchHatenaBookmarkCommentOEmbed(
      options.url,
      this.publicFetchOptions,
    );
  }

  // --- 公開 RSS 1.0 (RDF) フィード ---

  /**
   * ユーザーの公開ブックマーク RSS 1.0 フィードを取得する（ページング・絞り込み対応）
   */
  public async getMyFeed(
    options?: GetHatenaBookmarkMyFeedOptions,
  ): Promise<HatenaBookmarkRssItem[]> {
    const hatenaId = this.resolveHatenaId(options?.hatenaId);
    const params = new URLSearchParams();
    if (options?.page !== undefined) params.set('page', String(options.page));
    if (options?.tag) params.set('tag', options.tag);
    if (options?.q) params.set('q', options.q);
    if (options?.date) params.set('date', options.date);
    if (options?.url) params.set('url', options.url);

    const query = params.toString();
    const rssUrl = `https://b.hatena.ne.jp/${encodeURIComponent(hatenaId)}/rss${query ? `?${query}` : ''}`;
    const xml = await fetchPublicText(rssUrl, this.publicFetchOptions);
    return parseHatenaBookmarkRssXml(xml);
  }

  /**
   * お気に入りユーザーのブックマーク RSS 1.0 フィードを取得する
   */
  public async getFavoriteFeed(
    options: GetHatenaBookmarkFavoriteFeedOptions,
  ): Promise<HatenaBookmarkRssItem[]> {
    const hatenaId = this.resolveHatenaId(options.hatenaId);
    const key = options.key.trim();
    if (!key) {
      throw new HatenaApiError(
        'お気に入りフィードの key が指定されていません。',
        {
          code: 'API_ERROR',
        },
      );
    }

    const rssUrl = `https://b.hatena.ne.jp/${encodeURIComponent(hatenaId)}/favorite.rss?key=${encodeURIComponent(key)}`;
    const xml = await fetchPublicText(rssUrl, this.publicFetchOptions);
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

    const xml = await fetchPublicText(rssUrl, this.publicFetchOptions);
    return parseHatenaBookmarkRssXml(xml);
  }
}
