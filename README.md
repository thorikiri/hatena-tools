# hatena-tools

はてなブログおよびはてなサービス向けのツール群（APIクライアント、はてな記法パーサー/コンバーターなど）を提供するモノレポ（Monorepo）です。

## パッケージ構成

| パッケージ名                                                             | ディレクトリ                 | 概要                                            |
| ------------------------------------------------------------------------ | ---------------------------- | ----------------------------------------------- |
| [`@thorikiri/hatena-api-client`](./packages/hatena-api-client/README.md) | `packages/hatena-api-client` | はてなブログ・はてなサービス向けAPIクライアント |
| [`@thorikiri/hatena-syntax`](./packages/hatena-syntax/README.md)         | `packages/hatena-syntax`     | はてな記法パーサーおよびコンバーター            |

## ディレクトリ構成

```text
hatena-tools/
├── package.json              # ルート設定（npm workspaces）
├── tsconfig.base.json        # 共通 TypeScript 設定
├── vitest.config.ts          # Vitest 共通設定
├── biome.json                # Biome（Lint / Format）設定
└── packages/
    ├── hatena-api-client/    # はてなAPIクライアント
    │   ├── package.json
    │   ├── tsconfig.json
    │   └── src/
    └── hatena-syntax/        # はてな記法パーサー/コンバーター
        ├── package.json
        ├── tsconfig.json
        └── src/
```

## 動作要件

- Node.js 22 以上
- npm（npm workspaces を使用）

## 開発コマンド

ルートディレクトリで以下のコマンドを実行できます。

### 依存関係のインストール

```bash
npm install
```

### ビルド

全パッケージをビルドし、各パッケージの `dist/` 配下に ESM・CJS・型定義ファイル（`.d.ts`）を出力します。

```bash
npm run build
```

### テスト

Vitest を使用して全パッケージのテストを実行します。

```bash
npm test
```

ウォッチモードで実行する場合：

```bash
npm run test:watch
```

### 型チェック

全パッケージの TypeScript 型チェックを実行します。

```bash
npm run typecheck
```

### Lint / フォーマット

Biome を使用してコードの検証およびフォーマットを行います。

```bash
# Lint・フォーマットチェック
npm run lint

# 自動修正を含めてチェック
npm run lint:fix

# フォーマット実行
npm run format
```

## ライセンス

[MIT](./LICENSE)
