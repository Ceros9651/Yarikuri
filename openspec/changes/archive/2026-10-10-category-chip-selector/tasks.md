# Tasks

## 1. カテゴリ選択のチップUI化

- [x] 1.1 `src/components/TransactionForm.tsx` のカテゴリ `<select>`（155–171行付近）を、`categoryOptions` を各チップ（`<button type="button">`）として並べるボタン群に置き換える。各ボタンは `onClick` で `setCategoryId(c.id)` を呼び、`aria-pressed={selectedCategory === c.id}` で選択状態を示す。グループは `role="radiogroup"` と `aria-label="カテゴリ"` を付与し、既存の `errors.categoryId` 表示とラベル「カテゴリ」は維持する。検証: `npm run typecheck` が通る。
- [x] 1.2 `src/index.css` にチップ群のスタイル（`.chips` で `display:flex; flex-wrap:wrap; gap`、`.chips button` の枠・角丸、`aria-pressed='true'` 時の強調）を追加する。既存の `.segmented` の配色変数（`--surface` 等）に揃える。検証: `npm run dev` でブラウザ表示し、出費カテゴリ9個が1行に収まらない場合に折り返して全件表示され、タップで選択が切り替わり選択中が強調されることを目視確認する。

## 2. テストの更新

- [x] 2.1 `src/pages/transactions.test.tsx` のカテゴリ選択を、`user.selectOptions(getByLabelText('カテゴリ'), '食費')` からチップのクリック（例: `user.click(screen.getByRole('button', { name: '食費' }))`）に書き換える（出費・収入の記録、編集系のケースすべて）。検証: 該当テストが `npm test` で通る。
- [x] 2.2 「非表示カテゴリは選択肢に出ない」「カテゴリは種類ごとに出し分ける」のテスト（`optionNames(getByLabelText('カテゴリ'))` を使う箇所）を、チップのボタン名一覧を検証する方式に書き換える。検証: 非表示の「Amazon」がチップに現れないこと、種別切替で出費/収入のチップが入れ替わることを確認するテストが `npm test` で通る。

## 3. 仕上げ

- [x] 3.1 `npm test`・`npm run lint`・`npm run typecheck` をすべて実行し、全て成功することを確認する（settings.test.tsx のカテゴリ選択テストも同様にチップ方式へ更新）。
