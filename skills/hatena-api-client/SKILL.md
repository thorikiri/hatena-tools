---

name: hatena-api-client
description: Use when installing, configuring, or writing TypeScript/JavaScript code with @thorikiri/hatena-api-client for Hatena Blog (AtomPub), Hatena Bookmark, Hatena Fotolife, Hatena Star, OAuth 1.0a, or WSSE authentication.
---

# `@thorikiri/hatena-api-client` 利用ガイド

`@thorikiri/hatena-api-client` は、Web 標準 `fetch` API と Web Crypto API のみで実装されたゼロ依存・Universal Runtime（Node.js 22+ / Edge / Cloudflare Workers / Deno / Bun）対応のはてなサービス統合 API クライアントです。

## インストール

```bash
# npm レジストリ公開後
npm install @thorikiri/hatena-api-client

# GitHub Releases の tarball から導入する場合
npm install https://github.com/thorikiri/hatena-tools/releases/download/hatena-api-client-v0.1.0/thorikiri-hatena-api-client-0.1.0.tgz
```

## クライアント初期化

### OAuth 1.0a 認証（Web アプリ・複数ユーザー向け）

```ts
import { HatenaClient } from '@thorikiri/hatena-api-client';

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
    maxRetries: 3, // 429 (Retry-After) / 5xx 時の自動リトライ
    baseDelayMs: 500,
    maxDelayMs: 10_000,
  },
});
```

### WSSE 認証（個人スクリプト・CLI 向け）

```ts
const hatena = new HatenaClient({
  auth: {
    type: 'wsse',
    hatenaId: 'your-hatena-id',
    apiKey: process.env.HATENA_API_KEY!,
  },
  blogId: 'example.hatenablog.com',
});
```

### 3-legged OAuth 1.0a 認可フロー (`HatenaOAuth1`)

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

## サービス別 API クイックリファレンス

### 1. はてなブログ (`hatena.blog`)

- 記事一覧・全件取得・ページネーション:
  - `await hatena.blog.getEntries()` → `{ entries, nextUrl }`
  - `for await (const entry of hatena.blog.iterateEntries({ maxPages: 10 })) { ... }`
  - `await hatena.blog.getAllEntries()`
  - `await hatena.blog.getEntry({ entryId })`
- 記事作成・更新・削除:
  - `await hatena.blog.createEntry({ title, content, format: 'markdown' | 'html' | 'hatena', draft, scheduled, customUrl, categories })`
  - `await hatena.blog.updateEntry({ entryId, title, content, draft })`
  - `await hatena.blog.deleteEntry({ entryId })`
- 固定ページ・カテゴリー・サービス文書:
  - `getPages` / `iteratePages` / `getAllPages` / `getPage` / `createPage` / `updatePage` / `deletePage`
  - `getCategories()` / `getServiceDocument()`
- 認証不要の公開関数:
  - `fetchHatenaBlogOEmbed(entryUrl)`
  - `fetchHatenaBlogPublicFeed(blogDomain, { format: 'rss' | 'atom' })`

### 2. はてなブックマーク (`hatena.bookmark`)

- 認証付き REST API（OAuth 1.0a 推奨）:
  - `await hatena.bookmark.get({ url })`（未登録時は `null`）
  - `await hatena.bookmark.add({ url, comment, tags, private })`
  - `await hatena.bookmark.delete({ url })`（404 時も正常終了）
  - `await hatena.bookmark.getTags()` / `getEntry({ url })` / `getMyInfo()`
  - `await hatena.bookmark.searchMyBookmarks({ q, limit })`
- RSS フィード:
  - `getMyFeed({ page, tag })` / `getFavoriteFeed({ key })` / `getHotEntries({ category })`
- 認証不要の公開関数:
  - `fetchHatenaBookmarkCount(url)` / `fetchHatenaBookmarkCounts(urls)`（最大50件）
  - `fetchHatenaBookmarkEntryInfo(url, { lite: true })`
  - `fetchHatenaBookmarkCommentOEmbed(commentUrl)`

### 3. はてなフォトライフ (`hatena.fotolife`)

- `await hatena.fotolife.upload({ file, title, contentType, folder, generator })`
  - `file` は `Uint8Array` / `ArrayBuffer` / Node.js `Buffer` に対応
- `getPhotos()` / `getPhoto(idOrSyntaxOrUrl)` / `updatePhoto(id, { title })` / `deletePhoto(idOrSyntaxOrUrl)`
  - `photoId` / `editUrl` / `f:id:...` 記法 / CDN URL を自動判別可能

### 4. はてなスター (`hatena.star`) & ユーザー (`hatena.user`)

- ユーザー:
  - `await hatena.user.getMe()`
  - `getHatenaProfileImageUrl(hatenaId, 64 | 128 | 256 | 512)`
  - `hatena.user.getProfileImageUrl({ size })` / `await hatena.user.fetchProfileImage({ size })`
- スター（公開関数）:
  - `fetchHatenaStarBlogCount(blogUrl)`
  - `fetchHatenaStarEntries(urls)`
  - `getHatenaStarCountImageUrl({ uri, bg, large })` / `fetchHatenaStarCountImage({ uri })`

## エラーハンドリング

すべてのエラーは `HatenaApiError` に正規化されます。

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

## 実装時の注意点

- ブックマーク REST API を使用する場合は WSSE ではなく OAuth 1.0a を使用してください。
- SSRF 対策として内部 IP への不正 URL はクライアント側で `INVALID_URL` エラーになります。
- レート制限（HTTP 429）や一時エラーに備え、本番環境では `retry: { maxRetries: 3 }` 等の設定を推奨します。
