import {
  HatenaApiError,
  isTimeoutError,
  statusToErrorCode,
} from '../errors.js';
import type {
  HatenaBookmarkPublicFetchOptions,
  HatenaStarBlogCount,
  HatenaStarCountImageResult,
  HatenaStarEntry,
  HatenaStarImageOptions,
  HatenaStarItem,
} from '../types.js';

const STAR_BLOG_COUNT_URL = 'https://s.hatena.ne.jp/blog.json';
const STAR_ENTRY_URL = 'https://s.hatena.com/entry.json';
const STAR_IMAGE_URL = 'https://s.st-hatena.com/entry.count.image';
const DEFAULT_TIMEOUT_MS = 15_000;

interface RawStarBlogCountResponse {
  title?: string;
  uri?: string;
  star_count?: number | string;
  count?: Record<string, number | string>;
}

interface RawStarItem {
  name?: string;
  quote?: string;
  count?: number | string;
}

interface RawStarEntryResponse {
  entries?: Array<{
    uri?: string;
    stars?: RawStarItem[];
    colored_stars?: Array<{
      color?: string;
      stars?: RawStarItem[];
    }>;
  }>;
}

function toNumber(value: number | string | undefined, fallback = 0): number {
  if (value === undefined) return fallback;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function mapRawStarItems(items?: RawStarItem[]): HatenaStarItem[] {
  if (!Array.isArray(items)) return [];
  return items.map((item) => ({
    name: item.name ?? '',
    quote: item.quote ?? '',
    count: toNumber(item.count, 1),
  }));
}

async function fetchStarResponse(
  url: string,
  options?: HatenaBookmarkPublicFetchOptions,
): Promise<Response> {
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
        'はてなスター API への接続がタイムアウトしました',
        { code: 'TIMEOUT', cause: error },
      );
    }
    throw new HatenaApiError('はてなスター API への通信に失敗しました', {
      code: 'NETWORK_ERROR',
      cause: error,
    });
  }

  if (!response.ok) {
    const responseBody = await response.text().catch(() => undefined);
    throw new HatenaApiError(
      `はてなスター API がエラーを返しました (HTTP ${response.status})`,
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
 * X-Hatena-Star-Count ヘッダー（例: "yellow=326, green=4"）をパースする
 */
export function parseStarCountHeader(
  headerValue: string | null,
): Record<string, number> {
  if (!headerValue) return {};
  const result: Record<string, number> = {};
  for (const part of headerValue.split(',')) {
    const [rawColor, rawCount] = part.split('=').map((s) => s.trim());
    if (!rawColor || !rawCount) continue;
    const count = Number.parseInt(rawCount, 10);
    if (!Number.isNaN(count)) {
      result[rawColor] = count;
    }
  }
  return result;
}

/**
 * ブログ全体のスター総数・色別内訳を取得する（GET https://s.hatena.ne.jp/blog.json）
 */
export async function fetchHatenaStarBlogCount(
  blogUrl: string,
  options?: HatenaBookmarkPublicFetchOptions,
): Promise<HatenaStarBlogCount> {
  const trimmed = blogUrl.trim();
  if (!trimmed) {
    throw new HatenaApiError('対象ブログ URL が指定されていません。', {
      code: 'API_ERROR',
    });
  }

  const endpoint = `${STAR_BLOG_COUNT_URL}?uri=${encodeURIComponent(trimmed)}`;
  const response = await fetchStarResponse(endpoint, options);
  const data = (await response.json()) as RawStarBlogCountResponse;

  const count: Record<string, number> = {};
  if (data.count && typeof data.count === 'object') {
    for (const [color, value] of Object.entries(data.count)) {
      count[color] = toNumber(value, 0);
    }
  }

  return {
    title: data.title ?? '',
    uri: data.uri ?? trimmed,
    starCount: toNumber(data.star_count, 0),
    count,
  };
}

/**
 * 指定 URL（複数可）に付与されたスター一覧を取得する（GET https://s.hatena.com/entry.json）
 */
export async function fetchHatenaStarEntries(
  uris: string[],
  options?: HatenaBookmarkPublicFetchOptions,
): Promise<HatenaStarEntry[]> {
  const normalized = uris.map((u) => u.trim()).filter(Boolean);
  if (normalized.length === 0) {
    return [];
  }

  const query = normalized.map((u) => `uri=${encodeURIComponent(u)}`).join('&');
  const endpoint = `${STAR_ENTRY_URL}?${query}`;
  const response = await fetchStarResponse(endpoint, options);
  const data = (await response.json()) as RawStarEntryResponse;

  if (!Array.isArray(data.entries)) {
    return [];
  }

  return data.entries.map((entry) => ({
    uri: entry.uri ?? '',
    stars: mapRawStarItems(entry.stars),
    coloredStars: Array.isArray(entry.colored_stars)
      ? entry.colored_stars.map((group) => ({
          color: group.color ?? '',
          stars: mapRawStarItems(group.stars),
        }))
      : [],
  }));
}

/**
 * はてなスターカウント画像 URL を生成する
 */
export function getHatenaStarCountImageUrl(
  options: HatenaStarImageOptions,
): string {
  const trimmedUri = options.uri.trim();
  if (!trimmedUri) {
    throw new HatenaApiError('対象 URI が指定されていません。', {
      code: 'API_ERROR',
    });
  }

  const params = new URLSearchParams({ uri: trimmedUri });
  if (options.bg?.trim()) {
    params.set('bg', options.bg.trim());
  }
  if (options.large) {
    params.set('q', '1');
  }

  return `${STAR_IMAGE_URL}?${params.toString()}`;
}

/**
 * はてなスターカウント画像バイナリと色別カウントを取得する（GET https://s.st-hatena.com/entry.count.image）
 */
export async function fetchHatenaStarCountImage(
  options: HatenaStarImageOptions,
  fetchOptions?: HatenaBookmarkPublicFetchOptions,
): Promise<HatenaStarCountImageResult> {
  const url = getHatenaStarCountImageUrl(options);
  const response = await fetchStarResponse(url, fetchOptions);

  const data = new Uint8Array(await response.arrayBuffer());
  const contentType = response.headers.get('content-type') ?? 'image/png';
  const starCounts = parseStarCountHeader(
    response.headers.get('x-hatena-star-count'),
  );

  return {
    url,
    contentType,
    data,
    starCounts,
  };
}

/**
 * はてなスター API クライアント（認証不要の公開 API 群）
 */
export class HatenaStarClient {
  private readonly fetchOptions: HatenaBookmarkPublicFetchOptions;

  constructor(options: HatenaBookmarkPublicFetchOptions = {}) {
    this.fetchOptions = {
      timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      fetch: options.fetch,
    };
  }

  /**
   * ブログ全体のスター総数・色別内訳を取得する
   */
  public getBlogCount(options: { uri: string }): Promise<HatenaStarBlogCount> {
    return fetchHatenaStarBlogCount(options.uri, this.fetchOptions);
  }

  /**
   * 複数 URL のスター一覧を取得する
   */
  public getEntries(options: { uris: string[] }): Promise<HatenaStarEntry[]> {
    return fetchHatenaStarEntries(options.uris, this.fetchOptions);
  }

  /**
   * 単一 URL のスター一覧を取得する
   */
  public async getEntry(options: {
    uri: string;
  }): Promise<HatenaStarEntry | null> {
    const entries = await this.getEntries({ uris: [options.uri] });
    return entries[0] ?? null;
  }

  /**
   * スターカウント画像 URL を生成する
   */
  public getCountImageUrl(options: HatenaStarImageOptions): string {
    return getHatenaStarCountImageUrl(options);
  }

  /**
   * スターカウント画像バイナリと色別カウントを取得する
   */
  public fetchCountImage(
    options: HatenaStarImageOptions,
  ): Promise<HatenaStarCountImageResult> {
    return fetchHatenaStarCountImage(options, this.fetchOptions);
  }
}
