# Tasks

## 1. 月の収支を差額中心にする

- [ ] 1.1 `src/pages/HomePage.tsx` の `<section className="summary-grid">`（3つの `.card`）を、差額を先頭に置く構造に置き換える。差額は「差額」のラベル（`.muted`）と大きな金額（`data-testid="net"`、マイナスのときは `.expense`）、その下に収入（`data-testid="income"`、`.income`）と出費（`data-testid="expense"`、`.expense`）を「ラベル左／金額右」の行で並べる。`aria-label="月の収支"` は残す
- [ ] 1.2 `src/index.css` の `.summary-grid` / `.summary-grid .card` / `.summary-grid .amount` を削除し、差額中心の新しいクラス（例: `.month-net`、`.month-flow`）を追加する。差額の金額は `font-size: 1.75rem; font-weight: 700; white-space: nowrap`、金額はすべて `font-variant-numeric: tabular-nums` で右揃え、`word-break` で桁を割らない。`npm run dev` を開き、開発者ツールのスマホ表示（幅 390px・360px）で、差額がいちばん大きく左揃えで表示されること、開発者ツールで金額を7桁に書き換えても1行に収まることを確認する

## 2. ホームのセクションを箱で囲まない

- [ ] 2.1 `src/pages/HomePage.tsx` の残高・カテゴリ別の出費・予算・カード別の利用額の `<section className="card">` を、ホーム専用のクラス（例: `.home-section`）に置き換える。`.card` 自体と、他画面の `.card` の使い方は変えない
- [ ] 2.2 `src/index.css` に `.home-section`（枠・背景・角丸なし、`margin-bottom: 24px`）と、その中の `.list` の罫線の見え方を追加する。開発者ツールのスマホ表示（幅 390px・360px）で、ホームに角丸の箱が表示されず、セクションの間が行の間より広く空いていること、取引一覧と設定の見た目が変わっていないことを確認する

## 3. 合計を見出しの行に移し、見出し「ホーム」を隠す

- [ ] 3.1 `src/index.css` に `.visually-hidden` と、見出しと合計を左右に並べる `.section-head`（`display: flex; justify-content: space-between; align-items: baseline`）を追加する
- [ ] 3.2 `src/pages/HomePage.tsx` の `<h1>ホーム</h1>` に `.visually-hidden` を付ける（要素とテキストは残す。`Layout.test.tsx` がレベル1見出し「ホーム」を探している）
- [ ] 3.3 残高セクションの見出しを `.section-head` にし、合計（`data-testid="balance-total"`）を見出しの行の右側へ移して、一覧末尾の `li.row-total` を削除する。カード別の利用額も同じ形にする（`data-testid="card-total"`）。開発者ツールのスマホ表示（390×844）で、残高の合計がスクロールせずに見え、口座一覧の末尾に「合計」の行が無いことを確認する

## 4. タブバーのアイコンを単色の線画にする

- [ ] 4.1 `src/components/Layout.tsx` の `TABS` の `icon`（🏠📋✏️⚙️）を、インライン svg のコンポーネント4つ（ホーム／取引一覧／入力／設定）に置き換える。各 svg は `width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true"`
- [ ] 4.2 `src/index.css` の `.tab-icon` を、svg に合わせて `display: block; width: 24px; height: 24px` に直す。開発者ツールのスマホ表示で、選択中のタブだけアイコンと文字が緑になり、他のタブは灰色系であること、ダークモード（開発者ツールの「prefers-color-scheme: dark」）でも同様であること、タップ領域の高さが変わっていないことを確認する

## 5. バーの色を状態の意味に絞る

- [ ] 5.1 `src/index.css` の `.bar-fill` の背景を `var(--text-muted)` 系の無彩色にし、`.budget-warning .bar-fill` は `var(--warning)`、`.budget-over .bar-fill` は `var(--danger)` のままにする。`:root` とダークモードの `:root` から `--bar` を削除し、`--bar` を参照している箇所が残っていないことを確認する
- [ ] 5.2 開発者ツールのスマホ表示で、カテゴリ別の出費のバーと通常状態の予算のバーが灰色系、注意・超過のカテゴリのバーだけ色付きで表示されることを、ライト・ダークの両方で確認する

## 6. 確認

- [ ] 6.1 `npm run lint` と `npm test` が通ることを確認する
- [ ] 6.2 （ユーザーが実行）`/ui-review --verify ui-refine-home` で Before/After を確認する。実装担当はこのタスクにチェックを付けない
