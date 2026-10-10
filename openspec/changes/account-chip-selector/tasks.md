# Tasks

## 1. 口座選択のチップUI化

- [ ] 1.1 `src/components/TransactionForm.tsx` の支払元系（`FROM_LABELS[type]`）の `<select>`（208–225行付近）を、`fromOptions` を各チップ（`<button type="button">`）として並べるボタン群に置き換える。カテゴリと同じく外側を `<div className="field">` + `<span>` ラベルにし、ボタン群は `<div className="chips" role="group" aria-label={FROM_LABELS[type]}>`、各ボタンは `onClick={() => setAccountId(a.id)}`・`aria-pressed={selectedFrom === a.id}` とする。`errors.accountId` の表示と残高調整時の「アプリ上の残高」表示は維持する。検証: `npm run typecheck` が通る。
- [ ] 1.2 振替先の `<select>`（227–247行付近）も同様に `toOptions` のチップ群（`aria-label="振替先"`、`onClick={() => setToAccountId(a.id)}`、`aria-pressed={selectedTo === a.id}`）に置き換える。`errors.toAccountId` の `role="alert"` 表示は維持する。検証: `npm run typecheck` が通る。
- [ ] 1.3 スタイルは既存の `.chips` を流用し、`src/index.css` は変更しない。検証: `npm run dev` でブラウザ表示し、出費・収入・振替・残高調整の各種類で口座がチップ表示され、タップで選択が切り替わり選択中がカテゴリと同じ見た目で強調されること、振替で振替元・振替先が独立して選べることを目視確認する。

## 2. テストの更新

- [ ] 2.1 `src/pages/transactions.test.tsx` に、指定ラベルのグループ内のチップをクリック／列挙するヘルパー（例: `chipNames(label)` = `within(screen.getByRole('group', { name: label })).getAllByRole('button').map(b => b.textContent)`、`pickChip(user, label, name)`）を追加する。振替元・振替先で同名のボタンが並ぶため、口座ボタンは必ずグループ内で取得する（既存の `categoryChipNames` もこのヘルパーで置き換えてよい）。検証: 型エラーなし。
- [ ] 2.2 `src/pages/transactions.test.tsx` の口座選択 `user.selectOptions(...LabelText('支払元' | '入金先' | '振替元' | '振替先'), ...)` をすべてチップのクリックに書き換え、保存後の引き継ぎ確認 `toHaveDisplayValue('Aカード')`（168行付近）は支払元グループ内の「Aカード」ボタンが `aria-pressed="true"` であることの確認に書き換える。検証: 該当テストが `npm test` で通る。
- [ ] 2.3 「選択肢の絞り込み」の `optionNames(getByLabelText(...))` を使う検証（266–296行付近）をチップ名一覧の検証に書き換え、使われなくなった `optionNames` を削除する。検証: クレジットカードが支払元にだけ出ること、非表示口座が出ないことのテストが `npm test` で通る。
- [ ] 2.4 `src/pages/settings.test.tsx` の「解約したカードを非表示にすると支払元から消え…」（106・113行付近）を、`findByRole('group', { name: '支払元' })` 内のボタンの有無で検証する方式に書き換える。検証: `npm test` で通る。
- [ ] 2.5 `src/pages/transactions.test.tsx` に、支払元のチップをタップすると選択が切り替わり、前の選択の `aria-pressed` が `false` になることを確認するテストを追加する。検証: `npm test` で通る。

## 3. 仕上げ

- [ ] 3.1 `npm test`・`npm run lint`・`npm run typecheck` をすべて実行し、全て成功することを確認する。編集画面（`EditTransactionPage`）でも既存の口座がチップで選択状態になっていることを `npm run dev` で目視確認する。
