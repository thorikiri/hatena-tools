import {
  HatenaApiError,
  isTimeoutError,
  statusToErrorCode,
} from '../errors.js';
import type { HatenaFetchClient } from '../http/fetch-client.js';
import { validateAllowedHatenaUrl } from '../http/url-validator.js';
import type {
  CreateHatenaBlogEntryOptions,
  FetchHatenaBlogOEmbedOptions,
  FetchHatenaBlogPublicFeedOptions,
  GetHatenaBlogEntriesOptions,
  HatenaBlogEntry,
  HatenaBlogEntryType,
  HatenaBlogFeed,
  HatenaBlogOEmbed,
  HatenaBlogPublicFeed,
  HatenaBlogPublicFeedFormat,
  HatenaBlogServiceDocument,
  HatenaBlogTargetOptions,
  IterateHatenaBlogEntriesOptions,
  UpdateHatenaBlogEntryOptions,
  UpdateHatenaBlogPageOptions,
} from '../types.js';
import {
  buildHatenaEntryXml,
  parseHatenaBlogPublicFeedXml,
  parseHatenaCategoriesXml,
  parseHatenaEntriesFeedXml,
  parseHatenaEntryXml,
  parseHatenaServiceDocumentXml,
} from './blog-xml.js';

const ATOM_CONTENT_TYPE = 'application/atom+xml; charset=utf-8';
const BLOG_ALLOWED_HOSTS = ['blog.hatena.ne.jp'] as const;
const OEMBED_ENDPOINT = 'https://hatena.blog/oembed';
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_PAGES = 200;

interface RawHatenaBlogOEmbedResponse {
  version?: string;
  type?: string;
  title?: string;
  url?: string;
  description?: string;
  html?: string;
  width?: string | number;
  height?: string | number;
  image_url?: string | null;
  categories?: string[];
  blog_title?: string;
  blog_url?: string;
  author_name?: string;
  author_url?: string;
  provider_name?: string;
  provider_url?: string;
  published?: string;
}

async function fetchPublicBlogResponse(
  endpoint: string,
  options?: { timeoutMs?: number; fetch?: typeof globalThis.fetch },
): Promise<Response> {
  const fetchImpl = options?.fetch ?? globalThis.fetch;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let response: Response;
  try {
    response = await fetchImpl(endpoint, {
      method: 'GET',
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (isTimeoutError(error)) {
      throw new HatenaApiError(
        'はてなブログ公開 API への接続がタイムアウトしました',
        { code: 'TIMEOUT', cause: error },
      );
    }
    throw new HatenaApiError('はてなブログ公開 API への通信に失敗しました', {
      code: 'NETWORK_ERROR',
      cause: error,
    });
  }

  if (!response.ok) {
    const responseBody = await response.text().catch(() => undefined);
    throw new HatenaApiError(
      `はてなブログ公開 API がエラーを返しました (HTTP ${response.status})`,
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
 * はてなブログの公開記事 URL から oEmbed 情報を取得する（認証不要）
 */
export async function fetchHatenaBlogOEmbed(
  url: string,
  options?: FetchHatenaBlogOEmbedOptions,
): Promise<HatenaBlogOEmbed> {
  const trimmedUrl = url.trim();
  if (!trimmedUrl) {
    throw new HatenaApiError('対象の記事 URL が指定されていません。', {
      code: 'VALIDATION_ERROR',
    });
  }

  const endpoint = `${OEMBED_ENDPOINT}?url=${encodeURIComponent(trimmedUrl)}&format=json`;
  const response = await fetchPublicBlogResponse(endpoint, options);
  const data = (await response.json()) as RawHatenaBlogOEmbedResponse;

  return {
    version: data.version ?? '1.0',
    type: data.type ?? 'rich',
    title: data.title ?? '',
    url: data.url ?? trimmedUrl,
    description: data.description ?? '',
    html: data.html ?? '',
    width: String(data.width ?? '100%'),
    height: String(data.height ?? '190'),
    imageUrl: data.image_url ?? null,
    categories: Array.isArray(data.categories) ? data.categories : [],
    blogTitle: data.blog_title ?? '',
    blogUrl: data.blog_url ?? '',
    authorName: data.author_name ?? '',
    authorUrl: data.author_url ?? '',
    providerName: data.provider_name ?? 'Hatena Blog',
    providerUrl: data.provider_url ?? 'https://hatena.blog',
    published: data.published ?? '',
  };
}

/**
 * 公開はてなブログのフィード URL を組み立てる
 */
export function buildHatenaBlogPublicFeedUrl(
  blogUrlOrDomain: string,
  format: HatenaBlogPublicFeedFormat = 'rss',
): string {
  const trimmed = blogUrlOrDomain.trim();
  if (!trimmed) {
    throw new HatenaApiError(
      '対象ブログの URL またはドメインが指定されていません。',
      {
        code: 'API_ERROR',
      },
    );
  }

  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  const parsed = new URL(withProtocol);
  const suffix = format === 'atom' ? 'feed' : 'rss';
  const cleanPath = parsed.pathname.replace(/\/+$/, '');
  if (cleanPath.endsWith('/rss') || cleanPath.endsWith('/feed')) {
    return `${parsed.origin}${cleanPath}`;
  }
  return `${parsed.origin}${cleanPath}/${suffix}`;
}

/**
 * 公開はてなブログの RSS / Atom フィードを取得・パースする（認証不要）
 */
export async function fetchHatenaBlogPublicFeed(
  blogUrlOrDomain: string,
  options?: FetchHatenaBlogPublicFeedOptions,
): Promise<HatenaBlogPublicFeed> {
  const format = options?.format ?? 'rss';
  const endpoint = buildHatenaBlogPublicFeedUrl(blogUrlOrDomain, format);
  const response = await fetchPublicBlogResponse(endpoint, options);
  const xml = await response.text();
  return parseHatenaBlogPublicFeedXml(xml);
}

export interface HatenaBlogClientDefaults {
  hatenaId?: string;
  blogId?: string;
  timeoutMs?: number;
  fetch?: typeof globalThis.fetch;
}

/**
 * はてなブログ AtomPub API クライアント（記事・固定ページ・カテゴリー）
 */
export class HatenaBlogClient {
  constructor(
    private readonly http: HatenaFetchClient,
    private readonly defaults: HatenaBlogClientDefaults = {},
  ) {}

  private resolveTarget(options?: HatenaBlogTargetOptions): {
    hatenaId: string;
    blogId: string;
  } {
    const hatenaId = (options?.hatenaId ?? this.defaults.hatenaId ?? '').trim();
    const blogId = (options?.blogId ?? this.defaults.blogId ?? '').trim();

    if (!hatenaId) {
      throw new HatenaApiError(
        'hatenaId が指定されていません。HatenaClient の初期化時またはメソッド引数で指定してください。',
        { code: 'VALIDATION_ERROR' },
      );
    }
    if (!blogId) {
      throw new HatenaApiError(
        'blogId が指定されていません。HatenaClient の初期化時またはメソッド引数で指定してください。',
        { code: 'VALIDATION_ERROR' },
      );
    }

    return { hatenaId, blogId };
  }

  private buildCollectionUrl(
    resource: 'entry' | 'page' | 'category',
    options?: HatenaBlogTargetOptions,
  ): string {
    const { hatenaId, blogId } = this.resolveTarget(options);
    return `https://blog.hatena.ne.jp/${encodeURIComponent(hatenaId)}/${encodeURIComponent(blogId)}/atom/${resource}`;
  }

  private buildMemberUrl(
    resource: 'entry' | 'page',
    id: string,
    options?: HatenaBlogTargetOptions,
  ): string {
    const trimmedId = id.trim();
    if (!trimmedId) {
      throw new HatenaApiError(`${resource}Id が指定されていません。`, {
        code: 'VALIDATION_ERROR',
      });
    }
    return `${this.buildCollectionUrl(resource, options)}/${encodeURIComponent(trimmedId)}`;
  }

  private async listItems(
    resource: 'entry' | 'page',
    entryType: HatenaBlogEntryType,
    options?: GetHatenaBlogEntriesOptions,
  ): Promise<HatenaBlogFeed> {
    const url = options?.nextUrl
      ? validateAllowedHatenaUrl(
          options.nextUrl,
          BLOG_ALLOWED_HOSTS,
          'Invalid Hatena AtomPub next URL',
        )
      : this.buildCollectionUrl(resource, options);

    const xml = await this.http.requestText({ url, method: 'GET' });
    return parseHatenaEntriesFeedXml(xml, { type: entryType });
  }

  private async getItem(
    resource: 'entry' | 'page',
    entryType: HatenaBlogEntryType,
    id: string,
    options?: HatenaBlogTargetOptions,
  ): Promise<HatenaBlogEntry> {
    const url = this.buildMemberUrl(resource, id, options);
    const xml = await this.http.requestText({ url, method: 'GET' });
    const parsed = parseHatenaEntryXml(xml, { type: entryType });
    if (!parsed) {
      throw new HatenaApiError(
        'はてなブログ AtomPub レスポンスのパースに失敗しました',
        { code: 'API_ERROR', responseBody: xml },
      );
    }
    return parsed;
  }

  private async createItem(
    resource: 'entry' | 'page',
    entryType: HatenaBlogEntryType,
    options: CreateHatenaBlogEntryOptions,
  ): Promise<HatenaBlogEntry> {
    const url = this.buildCollectionUrl(resource, options);
    const body = buildHatenaEntryXml(options);
    const xml = await this.http.requestText({
      url,
      method: 'POST',
      headers: { 'Content-Type': ATOM_CONTENT_TYPE },
      body,
    });
    const parsed = parseHatenaEntryXml(xml, { type: entryType });
    if (!parsed) {
      throw new HatenaApiError(
        'はてなブログ AtomPub レスポンスのパースに失敗しました',
        { code: 'API_ERROR', responseBody: xml },
      );
    }
    return parsed;
  }

  private async updateItem(
    resource: 'entry' | 'page',
    entryType: HatenaBlogEntryType,
    id: string,
    options: CreateHatenaBlogEntryOptions,
  ): Promise<HatenaBlogEntry> {
    const url = this.buildMemberUrl(resource, id, options);
    const body = buildHatenaEntryXml(options);
    const xml = await this.http.requestText({
      url,
      method: 'PUT',
      headers: { 'Content-Type': ATOM_CONTENT_TYPE },
      body,
    });
    const parsed = parseHatenaEntryXml(xml, { type: entryType });
    if (!parsed) {
      throw new HatenaApiError(
        'はてなブログ AtomPub レスポンスのパースに失敗しました',
        { code: 'API_ERROR', responseBody: xml },
      );
    }
    return parsed;
  }

  private async deleteItem(
    resource: 'entry' | 'page',
    id: string,
    options?: HatenaBlogTargetOptions,
  ): Promise<void> {
    const url = this.buildMemberUrl(resource, id, options);
    await this.http.request({ url, method: 'DELETE' });
  }

  private async *iterateItems(
    resource: 'entry' | 'page',
    entryType: HatenaBlogEntryType,
    options?: IterateHatenaBlogEntriesOptions,
  ): AsyncGenerator<HatenaBlogEntry> {
    const maxPages = options?.maxPages ?? DEFAULT_MAX_PAGES;
    let nextUrl = options?.nextUrl;
    let pageCount = 0;
    const seenUrls = new Set<string>();

    while (pageCount < maxPages) {
      const feed = await this.listItems(resource, entryType, {
        hatenaId: options?.hatenaId,
        blogId: options?.blogId,
        nextUrl,
      });
      pageCount += 1;

      for (const entry of feed.entries) {
        yield entry;
      }

      if (!feed.nextUrl || seenUrls.has(feed.nextUrl)) {
        break;
      }
      seenUrls.add(feed.nextUrl);
      nextUrl = feed.nextUrl;
    }
  }

  private async collectAllItems(
    generator: AsyncGenerator<HatenaBlogEntry>,
  ): Promise<HatenaBlogEntry[]> {
    const results: HatenaBlogEntry[] = [];
    for await (const item of generator) {
      results.push(item);
    }
    return results;
  }

  // --- 記事（Entry）API ---

  /**
   * ブログ記事一覧を取得する（GET /atom/entry）
   */
  public getEntries(
    options?: GetHatenaBlogEntriesOptions,
  ): Promise<HatenaBlogFeed> {
    return this.listItems('entry', 'post', options);
  }

  /**
   * ブログ記事をページネーションを辿りながら順次取得する（AsyncGenerator）
   */
  public iterateEntries(
    options?: IterateHatenaBlogEntriesOptions,
  ): AsyncGenerator<HatenaBlogEntry> {
    return this.iterateItems('entry', 'post', options);
  }

  /**
   * ブログ記事を全件配列で取得する
   */
  public getAllEntries(
    options?: IterateHatenaBlogEntriesOptions,
  ): Promise<HatenaBlogEntry[]> {
    return this.collectAllItems(this.iterateEntries(options));
  }

  /**
   * 単一のブログ記事を取得する（GET /atom/entry/{entryId}）
   */
  public getEntry(
    options: HatenaBlogTargetOptions & { entryId: string },
  ): Promise<HatenaBlogEntry> {
    return this.getItem('entry', 'post', options.entryId, options);
  }

  /**
   * ブログ記事を作成する（POST /atom/entry）
   */
  public createEntry(
    options: CreateHatenaBlogEntryOptions,
  ): Promise<HatenaBlogEntry> {
    return this.createItem('entry', 'post', options);
  }

  /**
   * ブログ記事を更新する（PUT /atom/entry/{entryId}）
   */
  public updateEntry(
    options: UpdateHatenaBlogEntryOptions,
  ): Promise<HatenaBlogEntry> {
    return this.updateItem('entry', 'post', options.entryId, options);
  }

  /**
   * ブログ記事を削除する（DELETE /atom/entry/{entryId}）
   */
  public deleteEntry(
    options: HatenaBlogTargetOptions & { entryId: string },
  ): Promise<void> {
    return this.deleteItem('entry', options.entryId, options);
  }

  // --- 固定ページ（Page）API ---

  /**
   * 固定ページ一覧を取得する（GET /atom/page）
   */
  public getPages(
    options?: GetHatenaBlogEntriesOptions,
  ): Promise<HatenaBlogFeed> {
    return this.listItems('page', 'page', options);
  }

  /**
   * 固定ページをページネーションを辿りながら順次取得する（AsyncGenerator）
   */
  public iteratePages(
    options?: IterateHatenaBlogEntriesOptions,
  ): AsyncGenerator<HatenaBlogEntry> {
    return this.iterateItems('page', 'page', options);
  }

  /**
   * 固定ページを全件配列で取得する
   */
  public getAllPages(
    options?: IterateHatenaBlogEntriesOptions,
  ): Promise<HatenaBlogEntry[]> {
    return this.collectAllItems(this.iteratePages(options));
  }

  /**
   * 単一の固定ページを取得する（GET /atom/page/{pageId}）
   */
  public getPage(
    options: HatenaBlogTargetOptions & { pageId: string },
  ): Promise<HatenaBlogEntry> {
    return this.getItem('page', 'page', options.pageId, options);
  }

  /**
   * 固定ページを作成する（POST /atom/page）
   */
  public createPage(
    options: CreateHatenaBlogEntryOptions,
  ): Promise<HatenaBlogEntry> {
    return this.createItem('page', 'page', options);
  }

  /**
   * 固定ページを更新する（PUT /atom/page/{pageId}）
   */
  public updatePage(
    options: UpdateHatenaBlogPageOptions,
  ): Promise<HatenaBlogEntry> {
    return this.updateItem('page', 'page', options.pageId, options);
  }

  /**
   * 固定ページを削除する（DELETE /atom/page/{pageId}）
   */
  public deletePage(
    options: HatenaBlogTargetOptions & { pageId: string },
  ): Promise<void> {
    return this.deleteItem('page', options.pageId, options);
  }

  // --- カテゴリー API ---

  /**
   * ブログのカテゴリー一覧を取得する（GET /atom/category）
   */
  public async getCategories(
    options?: HatenaBlogTargetOptions,
  ): Promise<string[]> {
    const url = this.buildCollectionUrl('category', options);
    const xml = await this.http.requestText({ url, method: 'GET' });
    return parseHatenaCategoriesXml(xml);
  }

  // --- サービス文書 API ---

  /**
   * ブログの AtomPub サービス文書を取得する（GET /atom）
   */
  public async getServiceDocument(
    options?: HatenaBlogTargetOptions,
  ): Promise<HatenaBlogServiceDocument> {
    const { hatenaId, blogId } = this.resolveTarget(options);
    const url = `https://blog.hatena.ne.jp/${encodeURIComponent(hatenaId)}/${encodeURIComponent(blogId)}/atom`;
    const xml = await this.http.requestText({ url, method: 'GET' });
    return parseHatenaServiceDocumentXml(xml);
  }

  // --- oEmbed API ---

  /**
   * 公開記事 URL の oEmbed 情報を取得する（GET https://hatena.blog/oembed）
   */
  public getOEmbed(options: { url: string }): Promise<HatenaBlogOEmbed> {
    return fetchHatenaBlogOEmbed(options.url, {
      timeoutMs: this.defaults.timeoutMs,
      fetch: this.defaults.fetch,
    });
  }

  // --- 公開フィード API ---

  /**
   * 公開はてなブログの RSS / Atom フィードを取得する（認証不要）
   */
  public getPublicFeed(options?: {
    blogUrl?: string;
    format?: HatenaBlogPublicFeedFormat;
  }): Promise<HatenaBlogPublicFeed> {
    const target = (options?.blogUrl ?? this.defaults.blogId ?? '').trim();
    if (!target) {
      throw new HatenaApiError('blogUrl または blogId が指定されていません。', {
        code: 'VALIDATION_ERROR',
      });
    }

    return fetchHatenaBlogPublicFeed(target, {
      format: options?.format,
      timeoutMs: this.defaults.timeoutMs,
      fetch: this.defaults.fetch,
    });
  }
}
