# Tasks

## 1. カレンダーの金額を日付の真下に左揃えにする

- [ ] 1.1 `src/index.css` の PC 版ブロックで `.tx-calendar-day` の `text-align: right` を `left` にする（`.tx-calendar-date` と `.tx-calendar-weekday` は左揃えのまま、左右の余白をそろえる）。`npm run dev` を開き、Playwright の 1280×800 と 1920×1080 で、各日の金額の左端が日付の左端とそろい、右隣の日の日付に寄って見えないこと、6 桁の金額（`-¥128,000` / `+¥268,000`）が枠からはみ出さないことを確認する

## 2. 絞り込みを条件ごとに 1 つのボタンにまとめる

- [ ] 2.1 `src/pages/TransactionsPage.tsx` の `FilterChips` を、条件ごとに名前と選択中の値（例「カテゴリ: すべて」）を表示する 1 つの操作に置き換え、カテゴリ・支払元を `.tx-filters` の中で 1 行に並べる。中身は `label` で名前を付けた native の `<select>`（先頭に「すべて」、選択肢・非表示の扱い・「未分類」は今のチップと同じ）とし、`.tx-filters` の下だけでボタンの見た目に装う。共通の `.chips` / `.field` には手を入れない。`src/pages/transactions.test.tsx` の「取引一覧のカテゴリ・支払元での絞り込み」と「取引一覧のカレンダー」のテストを、`aria-pressed` のチップではなく `getByRole('combobox', { name: 'カテゴリ' })` などの選択と選択中の値で書き換え、spec の「選択肢は一覧の上に並べない」（選択肢のカテゴリ名がボタンとして並ばない）も足して `npm test -- transactions` が通ることを確認する
- [ ] 2.2 Playwright の 390×844 で、カテゴリ・支払元の操作が 1 行に収まり、取引の一覧の 1 行目が画面の上半分に見えること、選んだ値が操作の文字に出ることを確認する。1280×800 で右列の上が 1 行になっていることも確認する

## 3. 一覧の見出しの行と出費の合計

- [ ] 3.1 `src/pages/TransactionsPage.tsx` で、一覧の直前に `.section-head` の行を常に置く。左に「10月の取引」（日付の絞り込み中は「10月14日の取引」と解除の `button.link`）、右に表示中の取引（`rows`）の出費の合計を `formatYen` で出す（振替・残高調整・収入は含めない、0 件は ¥0）。今の `.tx-day-filter` の行はこれに統合して消す。`transactions.test.tsx` に spec の「月の出費の合計を見出しに出す」「日付で絞り込むと、その日の合計になる」「カテゴリで絞り込むと、その条件の合計になる」を足し、既存の「解除」のテストが通るように直して `npm test -- transactions` が通ることを確認する

## 4. 一覧のカードをやめて罫線だけにする

- [ ] 4.1 `src/pages/TransactionsPage.tsx` の一覧の `<section className="card" aria-label="取引">` から `card` を外し（`aria-label` は残す）、見出しの行の下の罫線と `.list` の行の罫線だけで区切る。PC 版ブロックで `.tx-row:hover` の背景を `--surface-2` にする（共通の `.card` は変えない）。Playwright の 1280×800・1920×1080・390×844 とダークモードの 1280×800 で、一覧に枠・角丸・白い面がないこと、1 件だけのときに空いた箱が出ないこと、PC で行にマウスを乗せると背景が変わることを確認する

## 5. デザイン方針の更新

- [ ] 5.1 `docs/design-principles.md` に、カレンダーの中身と曜日を左揃えにそろえるルール、取引一覧の絞り込みは条件ごとに 1 つのボタンにまとめるルール、一覧の上に見出しと出費の合計を同じ行に置くルール、一覧をカードで囲まないルールを由来 `ui-refine-transactions` 付きで追記されていることを確認する（起票時に追記済み）

## 6. 確認

- [ ] 6.1 `npm run lint` と `npm test` が通ることを確認する
- [ ] 6.2 （ユーザーが実行）`/ui-review --verify ui-refine-transactions` で Before/After を確認する。実装担当はこのタスクにチェックを付けない
