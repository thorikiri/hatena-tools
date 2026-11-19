import { HatenaApiError } from '../errors.js';
import type { HatenaFetchClient } from '../http/fetch-client.js';
import { validateAllowedHatenaUrl } from '../http/url-validator.js';
import type {
  CreateHatenaBlogEntryOptions,
  GetHatenaBlogEntriesOptions,
  HatenaBlogEntry,
  HatenaBlogEntryType,
  HatenaBlogFeed,
  HatenaBlogTargetOptions,
  UpdateHatenaBlogEntryOptions,
  UpdateHatenaBlogPageOptions,
} from '../types.js';
import {
  buildHatenaEntryXml,
  parseHatenaCategoriesXml,
  parseHatenaEntriesFeedXml,
  parseHatenaEntryXml,
} from './blog-xml.js';

const ATOM_CONTENT_TYPE = 'application/atom+xml; charset=utf-8';
const BLOG_ALLOWED_HOSTS = ['blog.hatena.ne.jp'] as const;

export interface HatenaBlogClientDefaults {
  hatenaId?: string;
  blogId?: string;
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
        { code: 'API_ERROR' },
      );
    }
    if (!blogId) {
      throw new HatenaApiError(
        'blogId が指定されていません。HatenaClient の初期化時またはメソッド引数で指定してください。',
        { code: 'API_ERROR' },
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
        code: 'API_ERROR',
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
}
