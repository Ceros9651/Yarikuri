# Design

## Context

- データは Dexie（IndexedDB）の `accounts` / `categories` / `transactions` / `meta` テーブルにあり、DB スキーマは version 1。画面は `useLiveQuery` で DB を直接購読し、状態管理ライブラリは使っていない。
- 集計は `src/domain/summary.ts` の純粋関数 `summarizeMonth` が担い、カテゴリ別の出費合計（`byCategory`）をすでに算出している。予算の消化額はこの値をそのまま使える。
- 選択中の月は `MonthContext`（ホームと取引一覧で共有）が持つ。
- 出費の保存は `TransactionForm` → `saveTransaction`。保存後、新規入力はホーム `/` へ、編集は取引一覧 `/transactions` へ遷移する。アプリ全体で共通の通知（トースト）の仕組みはまだない。
- バックアップは `src/domain/backup.ts`（zod による検証、`BACKUP_VERSION = 1`）と `src/db/backup.ts`（1トランザクションで clear → bulkAdd）。

## Goals / Non-Goals

**Goals:**
- 「ある月の、あるカテゴリの有効な予算」を、保存済みの予算記録から常に算出できる単純なモデルにする（残高と同じく、派生値は保存しない）
- 予算の解決・状態判定・アラート文言の組み立てを純粋関数にし、spec のシナリオを単体テストで担保する
- 既存の DB とバックアップファイルを壊さずに移行する

**Non-Goals:**
- 端末の通知（Push API / Notification API）
- 収入カテゴリの予算、全体（合計）予算、年単位の予算
- 注意のしきい値（80%）をユーザーが変更する機能
- 予算の履歴を一覧・編集する画面（設定は「月を選んでカテゴリごとに入力する」形に限る）

## Decisions

### 1. データモデル：月ごとの「設定記録」を保存し、有効予算は都度解決する
```
Budget { categoryId, month: 'YYYY-MM', amount: number | null }  // 主キー [categoryId+month]
```
- 記録は「その月から予算をこの値にする」という意味。`amount: null` は「その月から予算なし（解除）」を表す。
- カテゴリ c・月 M の有効予算 = c の記録のうち `month <= M` で最大のもの。それが無い、または `amount === null` なら予算なし（spec: 予算の引き継ぎ）。
- 同じカテゴリ・同じ月を再設定すると記録を上書きする（`put`）。複合主キーにより1カテゴリ1か月に記録は1件だけになる。
- 解除を「記録の削除」で表すと、前の月の値が引き継がれて解除にならないため、null の記録として残す。逆に「この月の設定を消して前の月に従う」操作は提供しない（解除と区別が難しく、UI が複雑になるため）。
- 代替案：毎月の予算を全部保存する（月が変わるたびにコピー）→ コピーのタイミング（アプリを開かなかった月など）の扱いが面倒で、過去月の表示と矛盾しやすいので不採用。カテゴリに `budget` フィールドを持たせる → 月ごとの設定ができないので不採用。

### 2. Dexie スキーマ version 2 で `budgets` テーブルを追加
`this.version(2).stores({ ...v1, budgets: '[categoryId+month], categoryId' })`。既存テーブルの定義は変えないので、アップグレード関数は不要で既存データはそのまま残る。

### 3. ドメイン関数（`src/domain/budget.ts`）
- `resolveBudget(categoryId, month, budgets): number | null`：決定1の規則で有効予算を返す。
- `budgetStatus(spent, budget): 'normal' | 'warning' | 'over'`：`spent > budget` で over、`spent * 5 >= budget * 4`（= 80% 以上、整数演算で丸め誤差を避ける）で warning、それ以外は normal。
- `summarizeBudgets(month, summary, categories, budgets)`：表示中の出費カテゴリのうち有効予算があるものについて `{ categoryId, name, spent, budget, remaining, percent, status }` をカテゴリの並び順で返す。`spent` は `summarizeMonth().byCategory` の値（無ければ 0）を使い、集計規則を二重に持たない。`percent` は表示用に四捨五入した整数％（100% 超もそのまま表示）。
- `budgetAlertFor(tx, ...)`：取引が expense で、その日付の月・カテゴリの状態が warning / over なら表示用のメッセージ（カテゴリ名・状態・出費合計・予算額）を返し、それ以外は null。

### 4. リポジトリ関数（`src/db/repository.ts`）
- `setBudget(categoryId, month, amountInput: string)`：既存の `parseAmount`（1〜999,999,999）で検証し、不正なら `ValidationError`。対象が出費カテゴリでなければエラー。
- `clearBudget(categoryId, month)`：`amount: null` の記録を `put` する。
- 読み込みは `useAllData` に `budgets` を加えて同じ読み取りトランザクションで返す（名前が空の一瞬が描画される問題を避けた既存の方針に合わせる）。

### 5. 設定画面の予算セクション
`SettingsPage` に `BudgetsSection` を追加する。セクション内に月の切り替え（`MonthSwitcher` を再利用し、ホームと同じ選択月を使う）と、表示中の出費カテゴリごとに「有効予算の表示・金額入力・保存・解除」の行を並べる。入力欄の初期値は、その月の有効予算（引き継ぎ分を含む）。引き継いだ値か、その月に設定した値かを小さく表示する（例：「10月から引き継ぎ」）。
- 代替案：ホームの内訳から直接編集 → ホームが重くなり、予算 0 円使用のカテゴリが内訳に出ない問題もあるので不採用。

### 6. ホーム画面の表示
- 月の収支カードの上に、over のカテゴリがあるときだけ `role="alert"` のバナー（「予算超過：外食、趣味・娯楽」）を出す。
- 「カテゴリ別の出費」の後ろに新しいカード「予算」を追加し、決定3の `summarizeBudgets` の結果を行ごとに表示する（金額 / 予算、残り または 超過額、割合、横棒）。warning は `--warning`（新しい CSS 変数、ライト・ダーク両方に定義）、over は既存の `--danger` で色を付け、色だけに頼らず「注意」「超過」の文言も付ける。予算が1つもない月は設定画面へのリンクで案内する。
- 既存の「カテゴリ別の出費」カードは変更しない（monthly-summary の要件を変えないため）。

### 7. 出費保存時のアラート：遷移先へ router の state で渡す
- `TransactionForm` は保存成功後に DB から最新データを読み、`budgetAlertFor` でメッセージを作って `onSaved(id, alert)` で返す。新規・編集ページは `navigate(path, { state: { budgetAlert: alert } })` で遷移する。
- `Layout` が `useLocation().state?.budgetAlert` を読み、メイン領域の先頭に閉じるボタン付きのメッセージ（`role="status"`）として表示する。閉じるときは同じパスへ `replace` で state を消す。別の画面へ移動すると state が無くなるので自然に消える（spec: 出費保存時のアラート）。
- 代替案：Layout に通知用の Context を追加する → 状態のクリア（いつ消すか）を自前で管理する必要があり、遷移で消えるという要件に対して router の state のほうが単純。`window.alert` → 入力の流れを止め、スマホの PWA で見た目も悪いので不採用。

### 8. バックアップ形式 version 2
```
{ "format": "yarikuri-backup", "version": 2, "exportedAt": ..., "accounts": [...], "categories": [...], "transactions": [...], "budgets": [...] }
```
- エクスポートは常に version 2。インポートは version 1 と 2 を受け付け、version 1 は `budgets: []` として扱う。それ以外のバージョンは従来どおり「対応していないバージョン」で拒否する。
- 予算の検証：`categoryId` が存在する出費カテゴリを指すこと、`month` が `YYYY-MM`、`amount` が null または 1〜999,999,999 の整数であること、同じ `[categoryId+month]` が重複しないこと。違反すれば既存の不正ファイルと同じく理由を表示して中止する。
- `importData` / `exportData` のトランザクション対象に `budgets` を加え、全テーブルを1トランザクションで置き換える。

## Risks / Trade-offs

- [バックアップの version を上げると、この変更より前のアプリ（キャッシュされた古い PWA）では新しいファイルを読めない] → 端末は1台で、PWA は autoUpdate で次回起動時に新版になるため実害は小さい。逆方向（旧ファイル → 新アプリ）は読めるようにする
- [「この月の設定を消して前月に従う」操作がない] → 前月と同じ金額を入力すれば同じ結果になる。必要になったら後から追加できる（データモデルの変更は不要）
- [カテゴリを非表示にしても予算記録は残る] → 再表示で元に戻せる利点を優先する（spec: 非表示カテゴリの予算）
- [保存のたびに注意・超過のメッセージが出て煩わしい] → 使い過ぎを防ぐという目的を優先し、毎回出す。閉じるボタンと画面遷移で消えるようにして負担を抑える
- [保存後に全データを読み直すコスト] → 個人利用の件数なら問題ない（既存の残高計算と同じ前提）

## Migration Plan

- Dexie が既存 DB を version 1 → 2 に自動で上げ、空の `budgets` テーブルを作る。既存データの変換は不要。
- ロールバック：前のコミットを revert して再デプロイする。ただし Dexie は DB のバージョンを下げられないため、旧アプリはバージョン 2 の DB を開けずにエラーになる。ロールバックが必要になった場合は、旧アプリでも DB を version 2 として宣言する（`budgets` を無視する）修正を入れて配信する。
