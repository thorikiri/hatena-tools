---

name: hatena-syntax
description: Use when parsing or converting Hatena Notation (はてな記法), HTML, or Markdown with @thorikiri/hatena-syntax, including hatenaToHtml, htmlToHatena, hatenaToMarkdown, markdownToHatena, markdownToHtml, htmlToMarkdown, unit converters, and parseHatena AST.
---

# `@thorikiri/hatena-syntax` 利用ガイド

`@thorikiri/hatena-syntax` は、外部パーサー（`marked` / `jsdom` 等）に依存しないゼロ依存の **はてな記法パーサーおよび はてな記法 ⇄ HTML ⇄ Markdown 双方向コンバーター** です。

## インストール

```bash
# npm レジストリ公開後
npm install @thorikiri/hatena-syntax

# GitHub Releases の tarball から導入する場合
npm install https://github.com/thorikiri/hatena-tools/releases/download/hatena-syntax-v0.1.0/thorikiri-hatena-syntax-0.1.0.tgz
```

## 1. テキスト全体の双方向変換 API

用途に応じて以下の 6 関数を使い分けます。

| 変換元 → 変換先       | 関数名                             | 特徴・主な用途                                                                               |
| :-------------------- | :--------------------------------- | :------------------------------------------------------------------------------------------- |
| はてな記法 → HTML     | `hatenaToHtml(text, options?)`     | AST からのセマンティック HTML 生成、目次/脚注、XSS 対策、カスタムフック                      |
| HTML → はてな記法     | `htmlToHatena(html, options?)`     | Tiptap 等のリッチエディタ HTML 出力からはてな記法へ復元                                      |
| はてな記法 → Markdown | `hatenaToMarkdown(text, options?)` | GFM 互換 Markdown への変換（テーブル・ネストリスト・脚注対応）                               |
| Markdown → はてな記法 | `markdownToHatena(md, options?)`   | Markdown からはてな記法へ変換（フォトライフ CDN URL 逆変換対応）                             |
| Markdown → HTML       | `markdownToHtml(md, options?)`     | Markdown + 混在するはてな独自記法（`[f:id:...]`, `[:contents]`, `[URL:embed]` 等）を HTML 化 |
| HTML → Markdown       | `htmlToMarkdown(html, options?)`   | HTML からの GFM Markdown 変換（目次カード・ブログカード・フォトライフ復元対応）              |

### よく使うオプションと注意点

1. **見出しレベルのシフト (`headingOptions`)**:
   - はてなブログでは `*` が `<h3>`、`**` が `<h4>` 相当として扱われる仕様があるため、記事本文の見出しを `h3` 基準にしたい場合は `headingOptions: { levelOffset: 2 }` を指定します。
   - 逆に `<h3>` を `*` に戻す場合は `headingOptions: { levelOffset: -2, minLevel: 1 }` を指定します。
2. **XSS 対策とカスタムレンダラー**:
   - `hatenaToHtml` / `markdownToHtml` はテキスト・属性のエスケープおよび `sanitizeUrl` による危険スキーム（`javascript:` 等）の無害化を行います。
   - `hatenaToHtml` で p タグ停止記法（`>< ... ><`）の生 HTML 出力を禁止したい場合は `allowRawHtml: false` を指定します。
   - `renderers?: HatenaHtmlRenderers` で `heading` / `codeBlock` / `blockquote` / `link` / `photo` / `embed` / `toc` / `more` の HTML 出力をカスタマイズできます（`undefined` を返すとデフォルト出力にフォールバック）。
3. **Markdown 混在モード (`markdownToHtml` / `htmlToMarkdown`)**:
   - `markdownToHtml`: `enableHatenaSyntax`（デフォルト `true`）で `[f:id:...]`, `[:contents]`, `[URL:embed]`, `[URL:bookmark]`, `[tex:...]`, `((脚注))` などの展開を制御できます。
   - `htmlToMarkdown`: `preserveHatenaPhotoSyntax: true` を指定すると、フォトライフ画像を `![alt](url)` ではなく `[f:id:...]` 記法へ復元します。

## 2. 記法・要素単体の変換 API

テキスト全体ではなく個別の記法だけを変換したい場合に使用します。

- **フォトライフ記法**:
  - `formatHatenaPhotoSyntax(syntaxOrUrl, filename?)`
  - `hatenaPhotoToHtml(syntax, { alt?, className?, loading? })`
  - `hatenaPhotoToMarkdown(syntax, { alt? })`
  - `imageUrlToHatenaPhoto(url, { syntaxOptions? })`（非フォトライフ URL は `null`）
  - `htmlImgToHatenaPhoto(imgHtml)`（非フォトライフ `<img>` は `null`）
- **見出し単体**:
  - `hatenaHeadingToHtml` / `hatenaHeadingToMarkdown`
  - `htmlHeadingToHatena` / `htmlHeadingToMarkdown`
  - `markdownHeadingToHatena` / `markdownHeadingToHtml`
  - すべて第 2 引数で `HeadingConvertOptions`（`levelOffset`, `minLevel`, `maxLevel`）を受け取ります。
- **ブロック・インライン・復元**:
  - `superPreToHtml` / `superPreToMarkdown` / `markdownCodeToSuperPre`
  - `hatenaQuoteToHtml` / `hatenaQuoteToMarkdown` / `markdownQuoteToHatena`
  - `hatenaLinkToHtml` / `hatenaLinkToMarkdown`
  - `unescapeHatenaSyntax(content)` — Tiptap 等のリッチエディタがエスケープした `\[f:id:...\]` や `\\|` 等を復元します。

## 3. 型付き AST パース (`parseHatena`)

```ts
import { parseHatena, parseHatenaPhotoSyntax } from '@thorikiri/hatena-syntax';

const doc = parseHatena(`* 見出し
本文((脚注))と [f:id:taro:20261121120000p:plain:title=題名:alt=説明]`);

// doc.blocks: HatenaBlockNode[]
// doc.footnotes: HatenaFootnoteDefinition[]
const photo = parseHatenaPhotoSyntax('[f:id:taro:20261121120000p:plain]');
```

## 対応記法サマリー

- **ブロック**: 見出し（`*`〜`******`）、リスト（`-`, `+` ネスト）、定義リスト（`:term:desc`）、表組み（`|...|`, `|*...|`）、引用（`>> ... <<`, `>URL> ... <<`）、pre（`>| ... |<`）、スーパーpre（`>|| ... ||<`, `>|lang| ... ||<`）、pタグ停止（`>< ... ><`）、目次（`[:contents]`）、続きを読む（`====`, `=====`, `====[label]`）、水平線（`----`）、連続空行2つによる `<br />`、下書きコメント（`<!-- ... -->`）、行頭半角スペースによる記法エスケープ
- **インライン / 自動リンク**: 脚注（`((...))`）、太字・打ち消し線・インラインコード、tex（`[tex:...]`, `[$ ... $]`）、http（`[URL]`, `:title=`, `:bookmark`, `:embed`）、fotolife（`[f:id:...]`, `f:id:...`, `:title=`, `:alt=`）、YouTube / Twitter / ASIN / ISBN / `id:` / `question:` / `[google:...]` / `[wikipedia:...]`、自動リンク停止（`[]...[]`）
