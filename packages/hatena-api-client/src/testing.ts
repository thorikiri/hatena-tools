import type { HatenaClient } from './client.js';
import type { HatenaBlogClient } from './services/blog.js';
import type { HatenaBookmarkClient } from './services/bookmark.js';
import type { HatenaFotolifeClient } from './services/fotolife.js';
import type { HatenaStarClient } from './services/star.js';
import type { HatenaUserClient } from './services/user.js';

/**
 * クラスからパブリックメソッド・プロパティのみを抽出したインターフェース型
 */
export type PublicInterface<T> = {
  [K in keyof T]: T[K];
};

export type HatenaUserClientLike = PublicInterface<HatenaUserClient>;
export type HatenaBlogClientLike = PublicInterface<HatenaBlogClient>;
export type HatenaBookmarkClientLike = PublicInterface<HatenaBookmarkClient>;
export type HatenaFotolifeClientLike = PublicInterface<HatenaFotolifeClient>;
export type HatenaStarClientLike = PublicInterface<HatenaStarClient>;

/**
 * HatenaClient と構造的に互換性のあるインターフェース型（DI やテストモック向け）
 */
export interface HatenaClientLike {
  readonly user: HatenaUserClientLike;
  readonly blog: HatenaBlogClientLike;
  readonly bookmark: HatenaBookmarkClientLike;
  readonly fotolife: HatenaFotolifeClientLike;
  readonly star: HatenaStarClientLike;
  request: HatenaClient['request'];
  requestText: HatenaClient['requestText'];
  requestJson: HatenaClient['requestJson'];
}

/**
 * createMockHatenaClient に渡す部分オーバーライド定義
 */
export interface HatenaClientMockOverrides {
  user?: Partial<HatenaUserClientLike>;
  blog?: Partial<HatenaBlogClientLike>;
  bookmark?: Partial<HatenaBookmarkClientLike>;
  fotolife?: Partial<HatenaFotolifeClientLike>;
  star?: Partial<HatenaStarClientLike>;
  request?: HatenaClientLike['request'];
  requestText?: HatenaClientLike['requestText'];
  requestJson?: HatenaClientLike['requestJson'];
}

function createServiceProxy<T extends object>(
  serviceName: string,
  overrides: Partial<T> = {},
): T {
  return new Proxy(overrides as T, {
    get(target, prop, receiver) {
      if (Reflect.has(target, prop)) {
        return Reflect.get(target, prop, receiver);
      }
      if (
        typeof prop === 'symbol' ||
        prop === 'then' ||
        prop === 'catch' ||
        prop === 'finally' ||
        prop === 'toJSON'
      ) {
        return undefined;
      }
      return () => {
        throw new Error(
          `[MockHatenaClient] Unimplemented method called: ${serviceName}.${String(prop)}`,
        );
      };
    },
  });
}

/**
 * テスト用のモック HatenaClient を生成する。
 * 指定したメソッドのみを差し替え、未実装メソッドの呼び出し時には明示的なエラーを送出する。
 */
export function createMockHatenaClient(
  overrides: HatenaClientMockOverrides = {},
): HatenaClientLike {
  return {
    user: createServiceProxy<HatenaUserClientLike>('user', overrides.user),
    blog: createServiceProxy<HatenaBlogClientLike>('blog', overrides.blog),
    bookmark: createServiceProxy<HatenaBookmarkClientLike>(
      'bookmark',
      overrides.bookmark,
    ),
    fotolife: createServiceProxy<HatenaFotolifeClientLike>(
      'fotolife',
      overrides.fotolife,
    ),
    star: createServiceProxy<HatenaStarClientLike>('star', overrides.star),
    request:
      overrides.request ??
      (() => {
        throw new Error(
          '[MockHatenaClient] Unimplemented method called: request',
        );
      }),
    requestText:
      overrides.requestText ??
      (() => {
        throw new Error(
          '[MockHatenaClient] Unimplemented method called: requestText',
        );
      }),
    requestJson:
      overrides.requestJson ??
      (() => {
        throw new Error(
          '[MockHatenaClient] Unimplemented method called: requestJson',
        );
      }),
  };
}
