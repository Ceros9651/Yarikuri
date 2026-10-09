# Tasks

## 1. ドメインロジック（純粋関数）

- [x] 1.1 `src/domain/types.ts` に `Budget { categoryId, month, amount: number | null }` を追加し（design 決定1）、`tsc --noEmit` が通ることを確認する
- [x] 1.2 `src/domain/budget.ts` に `resolveBudget` を実装し、budgets spec「予算の引き継ぎ」の4シナリオ（引き継ぎ・特定月の上書き・解除の引き継ぎ・最初の設定より前は予算なし）を単体テスト `budget.test.ts` で通す
- [x] 1.3 `budgetStatus` を実装し、「予算の状態の判定」の4シナリオ（31,999 円＝通常、32,000 円＝注意、40,000 円＝注意、40,001 円＝超過）を単体テストで通す
- [x] 1.4 `summarizeBudgets` を実装し（`summarizeMonth().byCategory` の出費を使う、出費 0 円でも予算があれば含める、非表示カテゴリ・収入カテゴリは除く、カテゴリの並び順）、「消化状況を表示する」「超過したカテゴリを強調する」の数値（残り・超過額・割合）と非表示カテゴリの除外を単体テストで確認する
- [x] 1.5 `budgetAlertFor` を実装し、「出費保存時のアラート」の4シナリオ（超過・注意・予算内・取引の日付の月で判定）と、収入・振替・残高調整では null になることを単体テストで通す

## 2. 永続化層

- [x] 2.1 `src/db/db.ts` に Dexie version 2 として `budgets: '[categoryId+month], categoryId'` を追加する。fake-indexeddb で version 1 の DB にデータを入れてから version 2 で開き直し、既存データが残り `budgets` が空で使えることをテストで確認する
- [x] 2.2 `src/db/repository.ts` に `setBudget`（`parseAmount` で検証、出費カテゴリ以外はエラー、同じ月は上書き）と `clearBudget`（`amount: null` を保存）を実装し、「予算を設定する」「不正な予算額は保存できない」「予算を解除する」をリポジトリテストで確認する
- [x] 2.3 `useAllData` に `budgets` を加えて同じ読み取りトランザクションで返すようにし、既存のホーム・取引一覧のテストが引き続き通ることを確認する

## 3. バックアップ（version 2）

- [x] 3.1 `src/domain/backup.ts` を version 2 に上げ、`budgets` のスキーマ検証（`month` 形式、amount は null か 1〜999,999,999 の整数、`[categoryId+month]` の重複なし）と参照チェック（存在する出費カテゴリ）を追加する。version 1 のファイルは `budgets: []` として受け付け、3 以上は拒否する。`backup.test.ts` に旧形式の読み込み・存在しないカテゴリの予算の拒否・未対応バージョンの拒否を追加して通す
- [x] 3.2 `src/db/backup.ts` の `exportData` / `importData` に `budgets` を加え、1トランザクションで置き換える。予算を含むデータのエクスポート → インポートの往復で全テーブルが一致することをテストで確認する
- [x] 3.3 `src/pages/backup.test.tsx` に「予算を含まない旧形式のファイルを読み込む」と「存在しないカテゴリの予算を含むファイルを選ぶ」の画面テストを追加して通す

## 4. 設定画面の予算セクション

- [x] 4.1 `src/components/settings/BudgetsSection.tsx` を作り、`SettingsPage` に追加する（月の切り替え、表示中の出費カテゴリごとに有効予算・入力欄・保存・解除、引き継ぎ元の月の表示、入力エラーの表示）。`settings.test.tsx` で、予算の設定・不正値のエラー・解除・翌月に引き継がれた値の表示・非表示カテゴリが一覧に出ないことを確認する

## 5. ホーム画面の予算表示

- [x] 5.1 `src/index.css` に注意用の `--warning` 色をライト・ダーク両方で追加し、予算の行（金額 / 予算、残り または 超過額、割合、横棒、注意・超過の文言）のスタイルを作る。開発サーバーの 390px 幅で横スクロールが出ないことを確認する
- [x] 5.2 `HomePage` に「予算」カードを追加し（予算がない月は設定画面へのリンクで案内）、`home.test.tsx` で「消化状況を表示する」「超過したカテゴリを強調する」シナリオと、予算なしの月の案内を確認する
- [x] 5.3 `HomePage` の月の収支の上に予算超過のまとめアラートを追加し、「超過カテゴリをまとめて知らせる」「超過がなければ表示しない」シナリオを `home.test.tsx` で通す。非表示カテゴリが消化状況とまとめに出ないことも確認する

## 6. 出費保存時のアラート

- [x] 6.1 `TransactionForm` の保存成功後に最新データから `budgetAlertFor` でメッセージを作り `onSaved(id, alert)` で返すようにし、`NewTransactionPage` / `EditTransactionPage` が `navigate(path, { state: { budgetAlert } })` で渡すようにする（design 決定7）
- [x] 6.2 `Layout` で location の state にある予算アラートを閉じるボタン付きで表示し、閉じると消え、別の画面へ移動すると消えるようにする。画面テストで、新規入力で超過・注意になるとホームにメッセージが出ること、予算内では出ないこと、編集の保存で取引一覧にメッセージが出ること、閉じる・画面移動で消えることを確認する

## 7. 統合確認

- [x] 7.1 `npm run lint`・`npm test`・`npm run build` がすべて成功することを確認する
- [x] 7.2 `npm run build && npm run preview` で、既存データのある状態から起動して DB が version 2 に上がりデータが残ること、予算の設定 → 出費入力 → アラート → ホームの表示 → エクスポート → インポートの流れが動くことをスマホ幅で手動確認する
- [x] 7.3 `openspec validate add-category-budgets --strict` が通ることを確認する
