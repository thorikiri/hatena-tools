import type { HatenaFetchClient } from '../http/fetch-client.js';
import type { HatenaUser } from '../types.js';

const MY_INFO_URL = 'https://n.hatena.com/applications/my.json';

interface RawHatenaUserResponse {
  url_name?: string;
  display_name?: string;
}

/**
 * はてなユーザー情報 API クライアント
 */
export class HatenaUserClient {
  constructor(private readonly http: HatenaFetchClient) {}

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
}
