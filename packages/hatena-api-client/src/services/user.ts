import {
  HatenaApiError,
  isTimeoutError,
  statusToErrorCode,
} from '../errors.js';
import type { HatenaFetchClient } from '../http/fetch-client.js';
import type {
  GetHatenaProfileImageOptions,
  HatenaProfileImageResult,
  HatenaProfileImageSize,
  HatenaUser,
} from '../types.js';

const MY_INFO_URL = 'https://n.hatena.com/applications/my.json';
const PROFILE_IMAGE_BASE = 'https://cdn.profile-image.st-hatena.com/users';
const DEFAULT_TIMEOUT_MS = 15_000;

interface RawHatenaUserResponse {
  url_name?: string;
  display_name?: string;
}

export interface HatenaUserClientOptions {
  hatenaId?: string;
  timeoutMs?: number;
  fetch?: typeof globalThis.fetch;
}

/**
 * はてなユーザーのプロフィール画像 URL を生成する
 */
export function getHatenaProfileImageUrl(
  hatenaId: string,
  size: HatenaProfileImageSize = 64,
): string {
  const trimmed = hatenaId.trim();
  if (!trimmed) {
    throw new HatenaApiError('hatenaId が指定されていません。', {
      code: 'VALIDATION_ERROR',
    });
  }

  const filename = size === 64 ? 'profile.png' : `profile_${size}x${size}.png`;
  return `${PROFILE_IMAGE_BASE}/${encodeURIComponent(trimmed)}/${filename}`;
}

/**
 * はてなユーザー情報 API クライアント
 */
export class HatenaUserClient {
  private readonly defaultHatenaId?: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof globalThis.fetch;

  constructor(
    private readonly http: HatenaFetchClient,
    options: HatenaUserClientOptions = {},
  ) {
    this.defaultHatenaId = options.hatenaId;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = options.fetch ?? globalThis.fetch;
  }

  /**
   * 認証済みユーザーの情報を取得する（GET https://n.hatena.com/applications/my.json）
   */
  public async getMe(): Promise<HatenaUser> {
    const data = await this.http.requestJson<RawHatenaUserResponse>({
      url: MY_INFO_URL,
      method: 'GET',
    });

    return {
      urlName: data.url_name ?? '',
      displayName: data.display_name ?? '',
    };
  }

  /**
   * ユーザーのプロフィール画像 URL を取得する
   */
  public getProfileImageUrl(options?: GetHatenaProfileImageOptions): string {
    const hatenaId = (options?.hatenaId ?? this.defaultHatenaId ?? '').trim();
    if (!hatenaId) {
      throw new HatenaApiError(
        'hatenaId が指定されていません。HatenaClient の初期化時またはメソッド引数で指定してください。',
        { code: 'API_ERROR' },
      );
    }

    return getHatenaProfileImageUrl(hatenaId, options?.size ?? 64);
  }

  /**
   * ユーザーのプロフィール画像バイナリをダウンロードして取得する
   */
  public async fetchProfileImage(
    options?: GetHatenaProfileImageOptions,
  ): Promise<HatenaProfileImageResult> {
    const url = this.getProfileImageUrl(options);

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: 'GET',
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      if (isTimeoutError(error)) {
        throw new HatenaApiError(
          'プロフィール画像の取得がタイムアウトしました',
          { code: 'TIMEOUT', cause: error },
        );
      }
      throw new HatenaApiError('プロフィール画像の取得に失敗しました', {
        code: 'NETWORK_ERROR',
        cause: error,
      });
    }

    if (!response.ok) {
      throw new HatenaApiError(
        `プロフィール画像の取得に失敗しました (HTTP ${response.status})`,
        {
          code: statusToErrorCode(response.status),
          status: response.status,
        },
      );
    }

    const data = new Uint8Array(await response.arrayBuffer());
    const contentType = response.headers.get('content-type') ?? 'image/png';

    return {
      url,
      contentType,
      data,
    };
  }
}
