# @thorikiri/hatena-api-client

Web 標準 `fetch` API と Web Crypto API のみで実装された、ゼロ依存・TypeScript 完全型定義のモダンなはてなサービス統合 API クライアントです。

## 特徴

- **ゼロ依存**: `fetch` と `crypto.subtle` のみを使用し、外部 HTTP クライアントや重量級の XML パーサー（`JSDOM` 等）に依存しません。
- **Universal Runtime**: Node.js 22+ をはじめ、Edge Runtime / Cloudflare Workers / Deno / Bun 等で動作します。
- **OAuth 1.0a & WSSE 両対応**: 3-legged OAuth フローおよび WSSE 認証を統一的に扱えます。
- **ESM & CJS デュアルパッケージ**: 完全な TypeScript 型定義（`.d.ts` / `.d.cts`）を提供します。
- **リトライ・バックオフ対応**: HTTP 429 (`Retry-After`) や 5xx・一時通信エラーに対する指数バックオフリトライを内蔵しています。

## インストール

> **Note**: 現在 npm レジストリへの公開準備中です（`npm publish` 完了後に以下のコマンドでインストール可能になります）。

```bash
npm install @thorikiri/hatena-api-client
```

### 公開前のインストール方法（GitHub Releases / ローカル）

GitHub Releases に配布されている tarball（`.tgz`）からインストールできます（`<version>` はリリースバージョンに置き換えてください）。

```bash
npm install https://github.com/thorikiri/hatena-tools/releases/download/hatena-api-client-v<version>/thorikiri-hatena-api-client-<version>.tgz
```

ローカルでビルドして別プロジェクトから参照する場合：

```bash
# hatena-tools リポジトリでビルド
npm run build

# 利用側プロジェクトでローカルパスを指定してインストール
npm install ../hatena-tools/packages/hatena-api-client
```

## クイックスタート

### クライアントの初期化

```ts
import { HatenaClient } from '@thorikiri/hatena-api-client';

// OAuth 1.0a 認証
const hatena = new HatenaClient({
  auth: {
    type: 'oauth1',
    consumerKey: process.env.HATENA_CONSUMER_KEY!,
    consumerSecret: process.env.HATENA_CONSUMER_SECRET!,
    accessToken: '...',
    accessSecret: '...',
  },
  hatenaId: 'your-hatena-id', // 省略時は各メソッドで指定可能
  blogId: 'example.hatenablog.com', // 省略時は各メソッドで指定可能
  timeoutMs: 15_000, // デフォルト: 15000ms
  retry: {
    maxRetries: 3, // 429 / 5xx 時の最大リトライ回数（デフォルト: 0）
    baseDelayMs: 500,
    maxDelayMs: 10_000,
  },
});

// WSSE 認証（個人スクリプト向け）
const hatenaWsse = new HatenaClient({
  auth: {
    type: 'wsse',
    hatenaId: 'your-hatena-id',
    apiKey: process.env.HATENA_API_KEY!,
  },
  blogId: 'example.hatenablog.com',
});
```

### OAuth 1.0a 認可フロー（3-legged）

```ts
import { HatenaOAuth1 } from '@thorikiri/hatena-api-client';

const oauth = new HatenaOAuth1({
  consumerKey: process.env.HATENA_CONSUMER_KEY!,
  consumerSecret: process.env.HATENA_CONSUMER_SECRET!,
});

// 1. Request Token 取得 & 認可URL生成
const { token, secret, authorizeUrl } = await oauth.getRequestToken({
  callbackUrl: 'https://example.com/api/hatena/callback',
  scope: ['read_public', 'write_public', 'read_private', 'write_private'],
});

// 2. コールバックで Access Token 交換
const credentials = await oauth.getAccessToken({
  token,
  secret,
  verifier: oauthVerifier,
});
```

---

## API リファレンス

### 1. ユーザー (`hatena.user`)

```ts
import { getHatenaProfileImageUrl } from '@thorikiri/hatena-api-client';

// 認証済みユーザー情報取得 (GET https://n.hatena.com/applications/my.json)
const me = await hatena.user.getMe();

// プロフィール画像 URL 生成（サイズ: 64 | 128 | 256 | 512、デフォルト: 64）
const iconUrl = getHatenaProfileImageUrl('jkondo', 256);
const myIconUrl = hatena.user.getProfileImageUrl({ size: 128 });

// プロフィール画像バイナリ取得 (Uint8Array)
const image = await hatena.user.fetchProfileImage({ size: 256 });
```

### 2. はてなブログ (`hatena.blog`)

#### AtomPub（記事・固定ページ・カテゴリー・サービス文書）

```ts
// 記事一覧・単一取得
const { entries, nextUrl } = await hatena.blog.getEntries();
const entry = await hatena.blog.getEntry({ entryId: '1234567890' });

// ページネーション自動巡回（AsyncGenerator / 全件配列取得）
for await (const item of hatena.blog.iterateEntries({ maxPages: 10 })) {
  console.log(item.title);
}
const allEntries = await hatena.blog.getAllEntries();

// 記事作成・更新・削除
const created = await hatena.blog.createEntry({
  title: 'タイトル',
  content: '# 本文',
  format: 'markdown', // 'markdown' | 'html' | 'hatena'
  draft: true,
  scheduled: false,
  customUrl: 'custom-slug',
  categories: ['Tech'],
});

await hatena.blog.updateEntry({
  entryId: created.entryId,
  title: '公開タイトル',
  content: '更新後の本文',
  draft: false,
});

await hatena.blog.deleteEntry({ entryId: created.entryId });

// 固定ページ（getPages / iteratePages / getAllPages / getPage / createPage / updatePage / deletePage）
const pages = await hatena.blog.getAllPages();

// カテゴリー一覧・サービス文書
const categories = await hatena.blog.getCategories();
const serviceDoc = await hatena.blog.getServiceDocument();
```

#### oEmbed & 公開フィード（認証不要）

```ts
import {
  fetchHatenaBlogOEmbed,
  fetchHatenaBlogPublicFeed,
} from '@thorikiri/hatena-api-client';

// oEmbed（ブログカードHTML・アイキャッチ・概要取得）
const oembed = await fetchHatenaBlogOEmbed(
  'https://staff.hatenablog.com/entry/2014/08/29/141633',
);

// 公開ブログ RSS 2.0 / Atom 1.0 フィード取得
const rssFeed = await fetchHatenaBlogPublicFeed('staff.hatenablog.com');
const atomFeed = await fetchHatenaBlogPublicFeed('staff.hatenablog.com', {
  format: 'atom',
});
```

### 3. はてなブックマーク (`hatena.bookmark`)

#### REST API & 全文検索（OAuth 1.0a 認証）

```ts
// 取得（未登録時は null）・追加/更新・削除（404時は正常終了）
const status = await hatena.bookmark.get({ url: 'https://example.com' });
await hatena.bookmark.add({
  url: 'https://example.com',
  comment: '参考になりました',
  tags: ['TypeScript', 'はてな'],
  private: false,
});
await hatena.bookmark.delete({ url: 'https://example.com' });

// タグ一覧・エントリー情報・ユーザー設定・全文検索
const tags = await hatena.bookmark.getTags();
const entryInfo = await hatena.bookmark.getEntry({
  url: 'https://example.com',
});
const myInfo = await hatena.bookmark.getMyInfo();
const searchResult = await hatena.bookmark.searchMyBookmarks({
  q: 'TypeScript',
  limit: 20,
});
```

#### 公開 API & RSS フィード（認証不要）

```ts
import {
  fetchHatenaBookmarkCommentOEmbed,
  fetchHatenaBookmarkCount,
  fetchHatenaBookmarkCounts,
  fetchHatenaBookmarkEntryInfo,
} from '@thorikiri/hatena-api-client';

// 件数取得（単一 / 複数最大50件）
const count = await fetchHatenaBookmarkCount('https://hatena.blog/');
const counts = await fetchHatenaBookmarkCounts([
  'https://hatena.blog/',
  'https://b.hatena.ne.jp/',
]);

// 公開エントリー情報・ブコメ一覧（lite: true で高速版）
const publicEntry = await fetchHatenaBookmarkEntryInfo('https://hatena.blog/', {
  lite: true,
});

// コメント oEmbed
const commentOEmbed = await fetchHatenaBookmarkCommentOEmbed(
  'https://b.hatena.ne.jp/entry/40863/comment/sample',
);

// RSS フィード（マイブックマーク / お気に入り / ホットエントリー）
const myFeed = await hatena.bookmark.getMyFeed({ page: 1, tag: 'TypeScript' });
const favFeed = await hatena.bookmark.getFavoriteFeed({ key: 'your-feed-key' });
const hotIt = await hatena.bookmark.getHotEntries({ category: 'it' });
```

### 4. はてなフォトライフ (`hatena.fotolife`)

```ts
// 画像アップロード (Uint8Array / ArrayBuffer / Node.js Buffer)
const uploaded = await hatena.fotolife.upload({
  file: imageBytes,
  title: 'sunset.jpg',
  contentType: 'image/jpeg',
  folder: 'Blog',
  generator: 'my-app',
});

// 写真一覧・単一取得・タイトル更新・削除
const feed = await hatena.fotolife.getPhotos();
const photo = await hatena.fotolife.getPhoto('20261119123456');
await hatena.fotolife.updatePhoto('20261119123456', {
  title: '更新後タイトル',
});

// deletePhoto / getPhoto / updatePhoto は photoId / editUrl / syntax / 画像URL を自動判別
await hatena.fotolife.deletePhoto('f:id:taro:20261119123456j:image');
```

### 5. はてなスター (`hatena.star`)

```ts
import {
  fetchHatenaStarBlogCount,
  fetchHatenaStarCountImage,
  fetchHatenaStarEntries,
  getHatenaStarCountImageUrl,
} from '@thorikiri/hatena-api-client';

// ブログ全体のスター数・色別内訳
const blogCount = await fetchHatenaStarBlogCount(
  'https://staff.hatenablog.com/',
);

// 指定 URL のスター一覧・カラースター取得
const starEntries = await fetchHatenaStarEntries([
  'https://staff.hatenablog.com/entry/2014/08/29/141633',
]);

// カウント画像 URL 生成 & バイナリ + X-Hatena-Star-Count 取得
const starImgUrl = getHatenaStarCountImageUrl({
  uri: 'https://staff.hatenablog.com/',
  bg: '#FFFFFF',
  large: true,
});
const starImg = await fetchHatenaStarCountImage({
  uri: 'https://staff.hatenablog.com/',
});
```

---

## エラーハンドリング

すべての API エラーは `HatenaApiError` に正規化されます。

```ts
import { HatenaApiError } from '@thorikiri/hatena-api-client';

try {
  await hatena.user.getMe();
} catch (error) {
  if (error instanceof HatenaApiError) {
    // error.code: 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'RATE_LIMITED' | 'TIMEOUT' | 'NETWORK_ERROR' | 'INVALID_URL' | 'API_ERROR'
    console.error(error.code, error.status, error.message);
  }
}
```

## ライセンス

[MIT](../../LICENSE)
