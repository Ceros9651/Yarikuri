# Design

## Context

- 表示中の月は `MonthContext`（`src/components/MonthContext.tsx`）がホームと取引一覧で共有しており、URL には載っていない。月の切り替え（`MonthSwitcher`）は画面遷移をしない。
- ルーターは `HashRouter`。取引一覧は `/transactions`、編集は `/transactions/:id`。
- 編集画面（`EditTransactionPage`）は保存・削除後に固定で `navigate('/transactions')` しており、保存時は `state.budgetAlert` を渡して `Layout` の `BudgetAlertNotice` に予算のお知らせを出させている。
- ホームのカテゴリ別内訳は `summarizeMonth` が `tx.categoryId ?? ''` で集計し、空文字のキーを「未分類」と表示している。カテゴリ ID は `crypto.randomUUID()`。カテゴリの削除機能はなく、非表示にできるだけ。
- UI は `docs/design-principles.md` に従う（カードで囲まない、飾りアイコンを使わない、色は状態にだけ使う）。

## Goals / Non-Goals

**Goals:**
- 絞り込みを URL で表し、ブラウザの戻る・再読み込みでも同じ一覧になるようにする。
- 既存の取引一覧の行の表示・並び順・編集への導線をそのまま使う。

**Non-Goals:**
- 月を URL に載せること（月は引き続き `MonthContext` で持つ）。
- 取引一覧画面からカテゴリを選んで絞り込む UI（今回はホームからの入口だけ）。
- 口座・種類・期間など、カテゴリ以外での絞り込み。
- カード別の利用額・予算の行からの遷移。

## Decisions

### 1. 絞り込みはクエリ `?category=<id>` で表し、未分類は `none` とする
`useSearchParams` で `category` を読む。値がカテゴリ ID なら `type === 'expense' && tx.categoryId === id` の取引を、`none` なら `type === 'expense' && !tx.categoryId` の取引を表示する。UUID と `none` は衝突しない。
- 代替案: `/transactions/category/:id` のパス。`/transactions/:id`（編集）とパスが紛らわしく、解除も「同じ画面のクエリを消す」ほうが素直なので採らない。
- 代替案: `MonthContext` のような Context に絞り込みを持つ。戻る操作や再読み込みで消え、タブから開いたときに解除する処理も別に要るので採らない。

月は URL に入れないので、絞り込み中に `MonthSwitcher` で月を変えてもクエリは残り、仕様どおり絞り込みが保たれる。

### 2. 絞り込み中のカテゴリ名は、非表示を含む全カテゴリから引く
`useAllData()` の `categories`（非表示を含む）から ID で名前を探す。`none` と、見つからない ID は「未分類」と表示する（ホームの表示と一致させる）。

### 3. 絞り込みの表示は一覧の上の1行のテキストと解除ボタン
`MonthSwitcher` と一覧の間に「食費の出費」のような1行と、右端に `button.link` の「絞り込みを解除」を置く。カードやチップ（角丸の塊）にはせず、アイコンも付けない。解除は `setSearchParams({}, { replace: true })` で、履歴を増やさずにクエリを消す（戻る操作でホームへ戻れるようにする）。

### 4. ホームのカテゴリ行は `<Link>` を行全体に広げる
`li.bar-row` の中身（名前・金額・バー）をまるごと `<Link to={`/transactions?category=${id || 'none'}`}>` で包み、グリッドのレイアウトをリンク側に移す。リンクの文字色は本文と同じにし下線は付けない。タップできることは、金額の右に本文より薄い「›」を置いて示す（月の切り替えと同じ記号で、飾りではなく移動の手がかり）。押したときは `--surface-2` の背景で反応を返す。バーの色・割合・金額の表示は変えない。
- 代替案: `button` + `navigate`。移動はリンクの意味なので `<Link>` を使う（長押しや新しいタブにも対応できる）。

### 5. 編集後の戻り先は `location.state.returnTo` で渡す
取引一覧から編集画面へ移動するときに `state: { returnTo: '/transactions' + location.search }` を渡し、編集画面は保存・削除後に `returnTo`（なければ `/transactions`）へ移動する。保存時は今までどおり `budgetAlert` も state に入れる。`returnTo` は `/transactions` で始まる値だけを受け付ける。
- 代替案: 編集後に `navigate(-1)`。編集画面を直接開いた場合に戻り先が不定になり、`budgetAlert` の state も渡せないので採らない。

## Risks / Trade-offs

- [編集画面を再読み込みすると `location.state` が残らない場合がある] → `returnTo` がなければ絞り込みのない一覧へ戻る。データは失われないので許容する。
- [ホームのカテゴリ行がリンクになり、読み上げで行全体が1つのリンク名になる] → リンク名が「食費 ¥30,000（75%）」となるよう、「›」は `aria-hidden` にする。
- [行全体をリンクにしたことで、スクロール中に誤タップしやすくなる] → 他のリストの行（取引一覧の行）と同じ扱いなので許容する。
