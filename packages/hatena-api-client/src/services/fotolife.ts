import { HatenaApiError } from '../errors.js';
import type { HatenaFetchClient } from '../http/fetch-client.js';
import { validateAllowedHatenaUrl } from '../http/url-validator.js';
import type {
  DeleteFotolifePhotoOptions,
  HatenaFotolifeFeed,
  HatenaFotolifePhoto,
  UpdateFotolifePhotoOptions,
  UploadFotolifePhotoOptions,
} from '../types.js';
import {
  buildFotolifeUpdateXml,
  buildFotolifeUploadXml,
  parseFotolifeEntryXml,
  parseFotolifeFeedXml,
} from './fotolife-xml.js';

const FOTOLIFE_POST_URL = 'https://f.hatena.ne.jp/atom/post';
const FOTOLIFE_FEED_URL = 'https://f.hatena.ne.jp/atom/feed';
const FOTOLIFE_ALLOWED_HOSTS = ['f.hatena.ne.jp'] as const;
const FOTOLIFE_CONTENT_TYPE = 'application/x.atom+xml; charset=utf-8';

function buildEditUrlFromPhotoId(photoId: string): string {
  return `https://f.hatena.ne.jp/atom/edit/${encodeURIComponent(photoId)}`;
}

function extractPhotoIdFromSyntax(syntax: string): string | null {
  const match = syntax.match(/f:id:[^:]+:(\d+)/i);
  return match?.[1] ?? null;
}

function extractPhotoIdFromImageUrl(imageUrl: string): string | null {
  const match = imageUrl.match(/\/(\d{14})\.[a-zA-Z0-9]+(?:\?.*)?$/);
  return match?.[1] ?? null;
}

/**
 * 文字列またはオプションオブジェクトからはてなフォトライフの Edit URI を解決・検証する
 */
export function resolveFotolifeEditUrl(
  target: string | DeleteFotolifePhotoOptions,
): string {
  if (typeof target === 'string') {
    const trimmed = target.trim();
    if (!trimmed) {
      throw new HatenaApiError('削除対象の写真IDまたはURLを指定してください', {
        code: 'API_ERROR',
      });
    }

    if (/^\d+$/.test(trimmed)) {
      return buildEditUrlFromPhotoId(trimmed);
    }

    const idFromSyntax = extractPhotoIdFromSyntax(trimmed);
    if (idFromSyntax) {
      return buildEditUrlFromPhotoId(idFromSyntax);
    }

    if (/^https?:\/\//i.test(trimmed)) {
      const idFromImage = extractPhotoIdFromImageUrl(trimmed);
      if (idFromImage) {
        return buildEditUrlFromPhotoId(idFromImage);
      }
      return validateAllowedHatenaUrl(
        trimmed,
        FOTOLIFE_ALLOWED_HOSTS,
        'Invalid Hatena Fotolife edit URL',
      );
    }

    throw new HatenaApiError(
      '削除対象の写真ID（Edit URI）を特定できませんでした',
      { code: 'API_ERROR' },
    );
  }

  if (target.editUrl) {
    return validateAllowedHatenaUrl(
      target.editUrl,
      FOTOLIFE_ALLOWED_HOSTS,
      'Invalid Hatena Fotolife edit URL',
    );
  }

  if (target.photoId?.trim()) {
    const id = target.photoId.trim();
    if (!/^\d+$/.test(id)) {
      throw new HatenaApiError('不正な photoId が指定されました', {
        code: 'API_ERROR',
      });
    }
    return buildEditUrlFromPhotoId(id);
  }

  if (target.syntax) {
    const id = extractPhotoIdFromSyntax(target.syntax);
    if (id) {
      return buildEditUrlFromPhotoId(id);
    }
  }

  if (target.imageUrl) {
    const id = extractPhotoIdFromImageUrl(target.imageUrl);
    if (id) {
      return buildEditUrlFromPhotoId(id);
    }
  }

  throw new HatenaApiError(
    '削除対象の写真ID（Edit URI）を特定できませんでした',
    { code: 'API_ERROR' },
  );
}

/**
 * はてなフォトライフ AtomPub API クライアント
 */
export class HatenaFotolifeClient {
  constructor(private readonly http: HatenaFetchClient) {}

  /**
   * 画像をアップロードする（POST https://f.hatena.ne.jp/atom/post）
   */
  public async upload(
    options: UploadFotolifePhotoOptions,
  ): Promise<HatenaFotolifePhoto> {
    const xmlBody = buildFotolifeUploadXml(options);
    const responseXml = await this.http.requestText({
      url: FOTOLIFE_POST_URL,
      method: 'POST',
      headers: {
        'Content-Type': FOTOLIFE_CONTENT_TYPE,
      },
      body: xmlBody,
    });

    const parsed = parseFotolifeEntryXml(responseXml);
    if (!parsed) {
      throw new HatenaApiError(
        'はてなフォトライフのアップロードレスポンスのパースに失敗しました',
        { code: 'API_ERROR', responseBody: responseXml },
      );
    }

    return parsed;
  }

  /**
   * 写真一覧フィードを取得する（GET https://f.hatena.ne.jp/atom/feed）
   */
  public async getPhotos(): Promise<HatenaFotolifeFeed> {
    const responseXml = await this.http.requestText({
      url: FOTOLIFE_FEED_URL,
      method: 'GET',
    });

    return parseFotolifeFeedXml(responseXml);
  }

  /**
   * 単一の写真情報を取得する（GET https://f.hatena.ne.jp/atom/edit/{photoId}）
   */
  public async getPhoto(
    target: string | DeleteFotolifePhotoOptions,
  ): Promise<HatenaFotolifePhoto> {
    const editUrl = resolveFotolifeEditUrl(target);
    const responseXml = await this.http.requestText({
      url: editUrl,
      method: 'GET',
    });

    const parsed = parseFotolifeEntryXml(responseXml);
    if (!parsed) {
      throw new HatenaApiError(
        'はてなフォトライフの写真情報レスポンスのパースに失敗しました',
        { code: 'API_ERROR', responseBody: responseXml },
      );
    }

    return parsed;
  }

  /**
   * 写真のタイトルを更新する（PUT https://f.hatena.ne.jp/atom/edit/{photoId}）
   */
  public async updatePhoto(
    target: string | DeleteFotolifePhotoOptions,
    options: UpdateFotolifePhotoOptions,
  ): Promise<void> {
    const editUrl = resolveFotolifeEditUrl(target);
    const xmlBody = buildFotolifeUpdateXml(options);
    await this.http.request({
      url: editUrl,
      method: 'PUT',
      headers: {
        'Content-Type': FOTOLIFE_CONTENT_TYPE,
      },
      body: xmlBody,
    });
  }

  /**
   * 写真を削除する（DELETE https://f.hatena.ne.jp/atom/edit/{photoId}）
   * 文字列（photoId / editUrl / syntax / imageUrl を自動判別）またはオブジェクトを指定可能
   */
  public async deletePhoto(
    target: string | DeleteFotolifePhotoOptions,
  ): Promise<void> {
    const editUrl = resolveFotolifeEditUrl(target);
    await this.http.request({
      url: editUrl,
      method: 'DELETE',
    });
  }
}
