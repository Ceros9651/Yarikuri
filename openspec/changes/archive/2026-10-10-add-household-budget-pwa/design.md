# Design

## Context

リポジトリは README のみの新規プロジェクト。利用者は本人1人・スマホ1台で、データは端末内のみに保存する（proposal.md の Why / Impact 参照）。サーバーを持たない静的サイトとして GitHub Pages（`https://<user>.github.io/Yarikuri/` のようなサブパス）から配信するため、ルーティング・PWA のスコープ・アセットのパスはすべてサブパスを前提にする必要がある。

## Goals / Non-Goals

**Goals:**
- 残高と集計を、保存済みの取引から常に再計算できる単純なデータモデルにし、編集・削除・インポート後も値の整合性が崩れないようにする
- 計算ロジック（残高・集計・バックアップ検証）を UI から分離した純粋関数にし、単体テストで仕様のシナリオを担保する
- 依存を最小限に保ち、ビルド成果物を軽くしてスマホでの起動を速くする

**Non-Goals:**
- サーバー API、認証、クラウド同期、複数端末間のマージ
- 複数通貨・小数金額
- グラフ描画ライブラリの導入（カテゴリ別内訳は CSS の横棒で表現する）

## Decisions

### 1. 技術スタック：Vite + React + TypeScript
grill で決定済み。状態管理ライブラリは導入せず、データは IndexedDB を単一の情報源とし、ライブクエリで画面に反映する。
- 代替案：Redux/Zustand → 永続層と二重管理になるため不採用。

### 2. 永続化：Dexie.js（IndexedDB ラッパー）＋ `dexie-react-hooks` の `useLiveQuery`
スキーマのバージョン管理（将来のマイグレーション）とトランザクションが使え、変更時に画面が自動で再描画される。
- 代替案：生の IndexedDB → 記述量が多くテストしにくい。`idb` → ライブクエリがない。localStorage → 容量・同期 API の制約で不採用。

### 3. データモデル（残高は保存せず、毎回算出する）
```
Account     { id, name, type: 'cash'|'bank'|'emoney'|'credit', initialBalance /* credit は常に 0・未使用 */, hidden, sortOrder, createdAt }
Category    { id, kind: 'income'|'expense', name, hidden, sortOrder }
Transaction { id, type: 'income'|'expense'|'transfer'|'adjustment',
              date: 'YYYY-MM-DD', amount, accountId, toAccountId?, categoryId?, memo?, createdAt, updatedAt }
```
- `id` は `crypto.randomUUID()`。日付はタイムゾーンのずれを避けるため端末ローカル日付の文字列で保持する。
- `amount` は income/expense/transfer では正の整数。adjustment のみ符号付き（差額）。
- 取引はカテゴリ名ではなく `categoryId` を参照するので、名前変更は過去の取引に自動で反映される。
- クレジットカードは `type: 'credit'` の Account として同じテーブルに置く。カードは expense の `accountId`（支払元）としてのみ参照される。
  - 代替案：カード専用テーブルを分ける → 支払元の選択・非表示・バックアップの処理が二重になるので不採用。
- 残高を保存しない理由：取引の編集・削除・インポートのたびに残高を更新する処理が不要になり、不整合が原理的に起きない。個人利用の件数（年数千件）なら全件走査でも十分速い。
  - 代替案：口座に現在残高を保存して差分更新 → 編集・削除時の不整合リスクが高いので不採用。

### 4. 残高計算の規則（`domain/balance.ts` の純粋関数）
現金・銀行・電子マネーの口座ごとに「指定日（含む）までの取引」を走査し、`initialBalance` に符号付きの変化量を足し合わせる。クレジットカードは残高計算の対象外（spec: accounts）。
| 取引 | 現金/銀行/電子マネー |
|---|---|
| income（入金先） | +amount |
| expense（支払元） | −amount |
| transfer 振替元 | −amount |
| transfer 振替先 | +amount |
| adjustment | +amount（符号付き） |

- クレジットカードを支払元にした expense は、どの口座の残高にも影響しない。入力チェック（`domain/validation.ts`）で、カードを income・transfer・adjustment の口座に指定できないようにする。
- ホームの残高は「選択月の末日まで」を基準日として計算する（spec: monthly-summary）。
- 残高調整の保存時は、調整日までの算出値（その調整自身は除く）と入力値の差を `amount` とする。調整を編集する場合も「実際の残高」を入力し直させ、同じ方法で差額を再計算する。

### 5. 月次集計（`domain/summary.ts` の純粋関数）
`date` が `YYYY-MM` で始まる取引を対象に、income の合計、expense の合計、expense のカテゴリ別合計（降順、割合は四捨五入した整数％）、クレカ別の expense 合計とカード利用額の総計（非表示のカードも含める）を返す。transfer と adjustment は対象外。

### 6. ルーティング：`HashRouter`（react-router）
GitHub Pages は SPA の任意パスへの直接アクセスで 404 になるため、`#/transactions` 形式にしてサーバー設定なしで動かす。画面：ホーム `/`、取引一覧 `/transactions`、入力 `/new`（種類タブ：出費／収入／振替／調整、既定は出費）、編集 `/transactions/:id`、設定 `/settings`（口座管理・カテゴリ管理・バックアップ）。
- 代替案：BrowserRouter ＋ 404.html リダイレクトの小技 → 構成が複雑になるだけなので不採用。

### 7. PWA：`vite-plugin-pwa`（Workbox、`registerType: 'autoUpdate'`）
ビルド成果物をすべてプリキャッシュしてオフラインで起動させる。Vite の `base` を `/Yarikuri/` にし、manifest の `start_url`・`scope` もそれに合わせる。iOS 用に `apple-touch-icon` と `apple-mobile-web-app-*` の meta タグを追加する。
- アイコン：単色の背景（テーマカラーの緑系）に白抜きの「¥」硬貨の図柄を描いた SVG を1つ作り、そこから 180（apple-touch-icon）・192・512・512 マスカブル（図柄を中央 80% の安全領域に収める）の PNG を書き出す。外部の素材は使わず、ライセンスの問題を避ける。`@vite-pwa/assets-generator` で SVG から PNG を生成する。起動時に `navigator.storage.persist()` を呼び、自動削除されにくくする。
- 更新はサービスワーカーが裏で取得し、次回起動時に反映する（データは IndexedDB にあるので影響しない）。

### 8. バックアップ形式と検証
```
{ "format": "yarikuri-backup", "version": 1, "exportedAt": ISO8601,
  "accounts": [...], "categories": [...], "transactions": [...] }
```
- インポート時は `zod` でスキーマを検証し、さらに参照整合性（`accountId`/`toAccountId`/`categoryId` が存在する）を確認する。問題がなければ Dexie の1トランザクション内で全テーブルを clear → bulkAdd する。途中で失敗した場合はロールバックされ、既存データは残る。
- エクスポートは、`navigator.canShare({ files })` が使える場合は Web Share API（iOS の PWA で「ファイルに保存」できる）、使えない場合は `<a download>` でダウンロードする。
- 代替案：CSV → 複数テーブルの往復が煩雑になるので不採用。

### 9. UI とスタイル
UI ライブラリは使わず、素の CSS（CSS 変数でテーマ、`prefers-color-scheme` でダークモード対応）で書く。下部固定のタブバー、`env(safe-area-inset-bottom)` でホームインジケーター分の余白を確保する。金額欄は `inputmode="numeric"` にする。

### 10. テスト
Vitest を使い、ドメイン関数（残高・集計・バックアップ検証）は単体テストで spec のシナリオを再現する。リポジトリ層は `fake-indexeddb` を使って、画面は React Testing Library でテストする。

### 11. デプロイ：GitHub Actions → GitHub Pages
`dev` ブランチへの push で `npm ci && npm test && npm run build` を実行し、`actions/upload-pages-artifact` と `actions/deploy-pages` で公開する。無料プランのため、リポジトリは公開設定にする。

## Risks / Trade-offs

- [カードの引き落としを記録しないため、銀行口座の算出残高は実際より多くなる] → 利用者の判断として許容。ずれは残高調整で実際の額に合わせる（調整は月の出費に含まれないので、カード払いが二重に計上されることはない）
- [ブラウザによるストレージの自動削除・端末の故障でデータを失う] → `storage.persist()` を要求する、設定画面に最終エクスポート日時を表示する、README に定期的なバックアップを推奨する旨を書く
- [iOS ではホーム画面の PWA と Safari のストレージが別] → 「ホーム画面から起動して使う」ことを README に明記する。Safari で入力したデータは PWA に引き継がれない
- [リポジトリが公開される] → 個人データはリポジトリに含まれないため影響なし。秘密情報をコミットしないことだけ守る
- [全件走査の計算コスト] → 年数千件なら問題ない。重くなった場合は月単位のスナップショットを後から追加できる（データモデルの変更は不要）
- [サービスワーカーのキャッシュで更新が反映されない] → `autoUpdate` と、ビルドごとに変わるハッシュ付きファイル名で対処する

## Migration Plan

新規アプリのため既存データの移行はない。初回は GitHub のリポジトリ設定で Pages のソースを「GitHub Actions」にする。ロールバックは、前のコミットを revert して再デプロイする。今後データ形式を変える場合は、Dexie のスキーマバージョンを上げてアップグレード関数で移行し、バックアップの `version` も上げてインポート側で旧版を変換する。
