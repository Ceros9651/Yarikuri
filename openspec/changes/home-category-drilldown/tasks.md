# Tasks

## 1. 取引一覧のカテゴリでの絞り込み

- [ ] 1.1 `src/pages/TransactionsPage.tsx` で `useSearchParams` から `category` を読み、値がカテゴリ ID なら `type === 'expense' && categoryId === id`、`none` なら `type === 'expense' && !categoryId` の取引だけに絞る（月の絞り込み・並び順・行の表示は今のまま）。`src/pages/transactions.test.tsx` に「`/transactions?category=<食費のid>` を開くと、同じ月の食費の出費だけが新しい順に出て、日用品の出費・収入は出ない」「`?category=none` でカテゴリのない出費だけが出る」「非表示にしたカテゴリでも絞り込める」テストを追加し、`npm test` で通ることを確認する
- [ ] 1.2 絞り込み中は `MonthSwitcher` と一覧の間に「<カテゴリ名>の出費」の1行と、右端に `button.link` の「絞り込みを解除」を表示する。カテゴリ名は非表示を含む全カテゴリから引き、`none` と見つからない ID は「未分類」とする。解除は `setSearchParams({}, { replace: true })`。スタイルは `src/index.css` に追加し、カードや角丸の塊にせずアイコンも付けない（`docs/design-principles.md`）。テストに「絞り込みの表示が出る」「解除すると同じ月の全取引が出て表示が消える」「前月ボタンを押しても絞り込みの表示が残り、前月の食費だけが出る」「出費のない月では『この月の取引はありません』相当の表示と解除の操作が両方出る」を追加し、`npm test` で通ることを確認する
- [ ] 1.3 取引一覧から編集画面へ移動するときに `state: { returnTo: '/transactions' + location.search }` を渡し、`src/pages/EditTransactionPage.tsx` の保存後・削除後の移動先を、`/transactions` で始まる `returnTo` があればそれ、なければ `/transactions` にする（保存時の `budgetAlert` は引き続き渡す）。テストに「食費で絞り込んだ一覧から取引を開いて金額を変えて保存すると、絞り込んだ一覧に戻り変更後の金額が出る」「削除しても絞り込んだ一覧に戻る」「絞り込み中に下部タブの『取引一覧』を押すと絞り込みが外れる」を追加し、既存の編集・削除・予算のお知らせのテストも含め `npm test` で通ることを確認する

## 2. ホームのカテゴリ行から取引一覧を開く

- [ ] 2.1 `src/pages/HomePage.tsx` の「カテゴリ別の出費」の各 `li` の中身（名前・金額・バー）を `<Link to={`/transactions?category=${categoryId || 'none'}`}>` で包み、金額の右に `aria-hidden` の薄い「›」を置く。`src/index.css` でグリッドのレイアウトをリンク側へ移し、リンクの文字色は本文と同じ・下線なし、押したときは `--surface-2` の背景にする。名前・金額・割合・バーの色と幅は変えない。`src/pages/home.test.tsx` に「食費の行のリンクを押すと取引一覧が開き、同じ月の食費の出費だけが出る」「未分類の行から開くとカテゴリのない出費だけが出る」テストを追加し、既存のカテゴリ別内訳のテストも含め `npm test` で通ることを確認する

## 3. 確認

- [ ] 3.1 `npm run lint` と `npm run build` が通ることを確認する
- [ ] 3.2 `npm run dev` を開き、開発者ツールのスマホ表示（幅 390px・360px）で、ホームのカテゴリ行をタップすると同じ月のそのカテゴリの取引一覧が開くこと、絞り込みの表示と解除が1行に収まって見えること、月を切り替えても絞り込みが残ること、端末の戻る操作でホームに戻れること、ホームのカテゴリ行の見た目（バーの色・金額の位置）が崩れていないことを確認する
