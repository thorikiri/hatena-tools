# @thorikiri/hatena-syntax

ゼロ依存・TypeScript 完全型定義の、はてな記法パーサーおよび **はてな記法 ⇄ HTML ⇄ Markdown** 双方向コンバーターです。

## 特徴

- **ゼロ依存**: 外部の Markdown / HTML DOM パーサー（`marked` / `jsdom` 等）に依存せず、Node.js・ブラウザ・Edge Runtime 等で動作します。
- **双方向テキスト変換**:
  - **はてな記法 ⇄ HTML** (`hatenaToHtml` / `htmlToHatena`)
  - **はてな記法 ⇄ Markdown** (`hatenaToMarkdown` / `markdownToHatena`)
  - **Markdown ⇄ HTML** (`markdownToHtml` / `htmlToMarkdown`) — はてなブログの Markdown / 見たままモードに混在するはてな独自記法（`[f:id:...]`, `[:contents]`, `[URL:embed]` 等）にも対応
- **記法・要素単体の変換 API**: フォトライフ記法・見出し・スーパーpre・引用・リンクなど、特定の記法だけをピンポイントで変換する純粋関数を提供します。
- **型付き AST パーサー**: `parseHatena` によりはてな記法を型付き AST（`HatenaDocument`）へパースできます。
- **XSS 対策 & カスタムフック**: HTML 生成時のテキスト・属性エスケープや URL スキーム検証（`sanitizeUrl`）を標準装備し、`HatenaHtmlRenderers` で出力を自由にカスタマイズ可能です。
- **ESM & CJS デュアルパッケージ**: 完全な TypeScript 型定義（`.d.ts` / `.d.cts`）を提供します。

## インストール

> **Note**: 現在 npm レジストリへの公開準備中です（`npm publish` 完了後に以下のコマンドでインストール可能になります）。

```bash
npm install @thorikiri/hatena-syntax
```

### 公開前のインストール方法（GitHub Releases / ローカル）

GitHub Releases に配布されている tarball（`.tgz`）からインストールできます（`<version>` はリリースバージョンに置き換えてください）。

```bash
npm install https://github.com/thorikiri/hatena-tools/releases/download/hatena-syntax-v<version>/thorikiri-hatena-syntax-<version>.tgz
```

ローカルでビルドして別プロジェクトから参照する場合：

```bash
# hatena-tools リポジトリでビルド
npm run build

# 利用側プロジェクトでローカルパスを指定してインストール
npm install ../hatena-tools/packages/hatena-syntax
```

---

## クイックスタート

### 1. テキスト全体の双方向変換

#### はてな記法 ⇄ HTML

```ts
import { hatenaToHtml, htmlToHatena } from '@thorikiri/hatena-syntax';

const html = hatenaToHtml(`[:contents]

* 見出し
本文((脚注テキスト))と [f:id:taro:20261121120000p:plain] です。

>|ts|
const x = 1;
||<`);

// Tiptap 等のリッチエディタ HTML からはてな記法へ逆変換
const hatena = htmlToHatena(html);
```

#### はてな記法 ⇄ Markdown

```ts
import { hatenaToMarkdown, markdownToHatena } from '@thorikiri/hatena-syntax';

const md = hatenaToMarkdown(`* 大見出し
|*列A|*列B|
|値1|値2|`);
// => "# 大見出し\n\n| 列A | 列B |\n| --- | --- |\n| 値1 | 値2 |"

const hatena = markdownToHatena(md);
// => "* 大見出し\n|*列A|*列B|\n|値1|値2|"
```

#### Markdown ⇄ HTML（はてな独自記法混在対応）

```ts
import { markdownToHtml, htmlToMarkdown } from '@thorikiri/hatena-syntax';

// Markdown 中の [:contents] や [f:id:...], [URL:embed], ((脚注)) も HTML 展開
const html = markdownToHtml(`[:contents]

# タイトル
[f:id:taro:20261121120000p:plain]
[https://example.com:embed]`);

// HTML から Markdown へ変換（フォトライフを [f:id:...] に復元することも可能）
const md = htmlToMarkdown(html, { preserveHatenaPhotoSyntax: true });
```

#### 主な変換オプション

- `headingOptions?: { levelOffset?: number; minLevel?: 1..6; maxLevel?: 1..6 }`
  - はてな記法の `*` を `<h3>` 基準にしたい場合は `{ levelOffset: 2 }`、`<h3>` を `*` に戻す場合は `{ levelOffset: -2, minLevel: 1 }` を指定できます。
- `generateToc?: boolean`（デフォルト: `true`）: `[:contents]` から見出し目次 `<nav class="hatena-toc">` を自動生成します。
- `renderFootnotes?: boolean`（デフォルト: `true`）: 末尾に `<section class="footnotes">`（Markdown では `[^n]: ...`）を出力します。
- `renderers?: HatenaHtmlRenderers`: `heading`, `codeBlock`, `blockquote`, `link`, `photo`, `embed`, `toc`, `more` ごとにカスタム HTML 出力フックを指定できます。
- `enableHatenaSyntax?: boolean`（`markdownToHtml`、デフォルト: `true`）: Markdown 内のはてな独自記法展開の ON/OFF を切り替えます。

---

### 2. 記法・要素単体の変換 API

テキスト全体ではなく、個別の記法・要素だけを変換したい場合は単体変換関数を利用できます。

````ts
import {
  formatHatenaPhotoSyntax,
  hatenaPhotoToHtml,
  hatenaPhotoToMarkdown,
  imageUrlToHatenaPhoto,
  htmlImgToHatenaPhoto,
  hatenaHeadingToHtml,
  htmlHeadingToHatena,
  markdownHeadingToHatena,
  superPreToMarkdown,
  markdownCodeToSuperPre,
  unescapeHatenaSyntax,
} from '@thorikiri/hatena-syntax';

// フォトライフ記法 ↔ HTML / Markdown / CDN URL
hatenaPhotoToHtml('[f:id:taro:20261121120000p:plain:alt=説明]', {
  loading: 'lazy',
});
imageUrlToHatenaPhoto(
  'https://cdn-ak.f.st-hatena.com/images/fotolife/t/taro/20261121/20261121120000.png',
);
// => '[f:id:taro:20261121120000p:image]'

// 見出し単体変換（レベルオフセット対応）
hatenaHeadingToHtml('* 見出し', { levelOffset: 2 }); // => '<h3>見出し</h3>'
htmlHeadingToHatena('<h3>見出し</h3>', { levelOffset: -2, minLevel: 1 }); // => '* 見出し'
markdownHeadingToHatena('## サブ見出し'); // => '** サブ見出し'

// スーパーpre ↔ Markdown コードブロック
superPreToMarkdown('>|ts|\nconst a = 1;\n||<'); // => '```ts\nconst a = 1;\n```'
markdownCodeToSuperPre('```ts\nconst a = 1;\n```'); // => '>|ts|\nconst a = 1;\n||<'

// リッチエディタ等がエスケープしたはてな記法の復元
unescapeHatenaSyntax('\\[f:id:taro:20261121120000p:plain\\]');
// => '[f:id:taro:20261121120000p:plain]'
````

---

### 3. 型付き AST パース (`parseHatena`)

```ts
import { parseHatena, parseHatenaPhotoSyntax } from '@thorikiri/hatena-syntax';

const doc = parseHatena(`* 見出し
本文((脚注))と [f:id:taro:20261121120000p:plain] です。`);

console.log(doc.blocks);
console.log(doc.footnotes);

const photo = parseHatenaPhotoSyntax(
  '[f:id:taro:20261121120000p:plain:title=題名:alt=説明]',
);
```

---

## 対応している主なはてな記法

- **ブロック要素**: 見出し（`*` 〜 `******`）、リスト（`-`, `+` ネスト対応）、定義リスト（`:term:desc`）、表組み（`|...|`, `|*...|`）、引用（`>> ... <<`, `>URL> ... <<`）、pre（`>| ... |<`）、スーパーpre（`>|| ... ||<`, `>|lang| ... ||<`）、pタグ停止（`>< ... ><`）、目次（`[:contents]`）、続きを読む（`====`, `=====`, `====[label]`）、水平線（`----`）、連続空行2つでの改行（`<br />`）、下書きコメント（`<!-- ... -->`）、行頭半角スペースによるエスケープ
- **インライン・自動リンク**: 脚注（`((...))`）、太字・打ち消し線・インラインコード、tex 記法（`[tex:...]`, `[$ ... $]`）、http 記法（`[URL]`, `[URL:title=...]`, `[URL:bookmark]`, `[URL:embed]`）、fotolife 記法（`[f:id:...]`, `f:id:...`, `:title=`, `:alt=`）、YouTube / Twitter / ASIN / ISBN / `id:` / `question:` / `[google:...]` / `[wikipedia:...]`、自動リンク停止（`[]...[]`）

## ライセンス

[MIT](./LICENSE)
