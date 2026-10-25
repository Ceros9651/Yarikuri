# Design

## Context

- 前提のコードは `origin/dev`（PBI-3 のカレンダーと `ui-refine-transactions` を取り込み済み）。ブランチ `PBI-36` はそれより古いので、実装の前に `origin/dev` を取り込む。
- スマホ版と PC 版の出し分けは、これまで CSS の `@media (min-width: 1024px)` だけで行ってきた（例: `.tx-calendar` はスマホで `display: none`、ホームの 2 列は CSS グリッド）。DOM と読み上げの順は画面幅によらず同じだった。
- 今回は画面幅によって「出すセクション」「セクションの順」「タブの名前」「URL が同じでも出す画面」が変わる（specs の `monthly-summary` / `transactions` / `pwa-app` を参照）。
- テストは jsdom（Vitest + Testing Library）で、`window.matchMedia` は存在しない。CSS は読み込まれないので、CSS で隠した要素もテストからは見える。
- ホームのカテゴリ別の出費は `HomePage.tsx` 内に直書きされ、行は `/transactions?category=<id|none>` へのリンク。

## Goals / Non-Goals

**Goals:**
- スマホ版で、ホームの並びと読み上げの順が一致する（残高 → 予算）。PC 版の見た目・読み上げの順は今と同じ。
- ウィンドウ幅を 1024px をまたいで変えると、再読み込みなしで切り替わる。
- カテゴリ別の出費の描画をホームと取引一覧で 1 か所にまとめる。

**Non-Goals:**
- PC 版の画面・サイドバーの変更。
- 「出費」タブのアイコンの変更（今のリストのアイコンのまま）。
- カテゴリ別の出費にカテゴリ以外の内訳（支払元別など）を加えること。

## Decisions

### 1. 画面幅は JS（`matchMedia`）で判定し、描画そのものを分ける

`src/hooks/useIsDesktop.ts` に `useSyncExternalStore` で `matchMedia('(min-width: 1024px)')` を購読するフックを置く。`change` イベントで再描画されるので、幅を変えるとその場で切り替わる。`matchMedia` がない環境（jsdom）では `true`（PC 版）を返す。

- 代替案: CSS だけで出し分ける（両方を描画して片方を `display: none`、ホームは `order` で並べ替え）。→ スマホで「残高 → 予算」と見せつつ PC で「予算 → 残高」と読ませる必要があり、どちらかで見た目と読み上げの順がずれる。取引一覧も「絞り込みなし」のときだけ中身が変わり、カテゴリ別の出費と一覧を両方描くと、見出し・`data-testid`・合計が二重になる。タブ名も 2 つの span を出し分けることになる。描画を分けるほうが単純。
- 代替案: ユーザーエージェントで端末を判定。→ 既存の PC/スマホの境界（1024px）と食い違い、幅の変更にも追従しない。
- ブレークポイントの値は CSS と JS の 2 か所に書くことになるので、フックのファイルに「`index.css` の `@media (min-width: 1024px)` とそろえる」と注記する。
- jsdom で PC 版を既定にするのは、既存のホーム・取引一覧・レイアウトのテスト（PC と同じ DOM を前提）をそのまま通すため。スマホ版のテストは `src/test/` のヘルパー（例 `mockViewport('mobile')`）で `window.matchMedia` を差し替えて書く。ヘルパーは `afterEach` で元に戻す。

### 2. カテゴリ別の出費を部品に切り出す

`src/components/CategoryBreakdown.tsx` に、`summarizeMonth` の `byCategory` を受け取り、見出し「カテゴリ別の出費」・（任意で）見出しの行の合計・行のリンク・空のときの文言を描く部品を作る。ホーム（PC 版）と取引一覧（スマホ版）の両方で使う。見出しの行の合計は取引一覧で出す（ホームでは月の収支のすぐ下にあり、出費の合計と重複するので出さない）。

- `UNCATEGORIZED` は今 `TransactionsPage.tsx` から export されてホームが import している。部品から import すると `TransactionsPage` → `CategoryBreakdown` → `TransactionsPage` の循環になるので、`src/domain/summary.ts` へ移し、ホーム・取引一覧・部品はそこから import する。

### 3. ホームは `isDesktop` で並びを切り替える

- PC 版: 今と同じ（左列 収支・カテゴリ、右列 カード・予算・残高）。
- スマホ版: 左列は収支だけ、右列はカード・残高・予算の順で描く。`.home-columns` / `.home-col` のラッパーはそのまま残す（スマホ版では CSS 上ただの縦並び）ので、CSS の変更は要らない。
- セクションの JSX は変数（`cardsSection` など）に入れて、順だけを切り替える。

### 4. 取引一覧は「スマホ版かつ一覧を求めていない」ときにカテゴリ別の出費を出す

`TransactionsPage` で `showBreakdown = !isDesktop && category === null && account === null && dateParam === null && searchParams.get('view') !== 'list'` を判定する。

- `showBreakdown` のとき: `<h1 className="visually-hidden">出費</h1>`、`MonthSwitcher`、`CategoryBreakdown`（見出しの行に月の出費の合計）、その下に「すべての取引」のリンク（`/transactions?view=list`）。ホームと同じく、タブ名と重なる h1 は読み上げ用に残す。
- それ以外: 今の画面のまま（h1「取引一覧」、カレンダーは CSS で隠れる）。
- `view=list` は「スマホで全取引の一覧を見ている」ことを URL で表す。スマホ版でカテゴリ・支払元の操作から両方を「すべて」に戻したときにカテゴリ別の出費へ戻らないよう、スマホ版の `setFilter` は `view=list` を付けたままにする（PC 版では付けない）。カテゴリの行から開いた一覧では `category` があるので、最初に絞り込みを「すべて」に戻すときに `view=list` を付ける。
- リンクは `navigate`/`Link` の push で開くので、戻る操作でカテゴリ別の出費に戻る。編集後の戻り先は既存どおり `location.search` を含むので、`view=list` も保たれる。
- タブ（`NavLink to="/transactions"`）はクエリを持たないので、押すとカテゴリ別の出費に戻る。`end: false` なので一覧表示中もタブは選択中のまま。
- PC 版で URL に `view=list` が付いていても（スマホで開いた URL を広い画面で見るなど）無視して今の画面を出す。

### 5. タブの名前

`Layout.tsx` の `TABS` の取引一覧の項目に、スマホ版の名前 `mobileLabel: '出費'` を持たせ、`isDesktop` でない時は `mobileLabel` を表示する。アイコン・リンク先は共通。

## Risks / Trade-offs

- [初回描画で幅の判定がずれてちらつく] → `useSyncExternalStore` の `getSnapshot` は同期的に `matchMedia(...).matches` を返すので、最初の描画から正しい側を描く。SSR はしていない。
- [CSS と JS で 1024px を二重に持つ] → フックに注記し、片方だけ変えないようにする。値は定数 1 つにまとめる。
- [jsdom の既定を PC 版にしたため、スマホ版の分岐がテストされないまま残る] → タスクでスマホ版のテスト（ホームの並び、出費タブ、全取引、絞り込み解除で一覧のまま、タブ名）を明示的に足す。
- [「すべての取引」を経由しないと、スマホで収入・振替・残高調整を編集できない] → 導線をカテゴリ別の出費の直下に常時表示する。出費のない月でも表示する。
- [PC 版のスクリーンショットで変化がないことの確認漏れ] → 実装後に 1280×800 でホーム・取引一覧を変更前と見比べる。

## Migration Plan

データや URL の互換性に影響はない（`/transactions?category=...` などの既存の URL はそのまま一覧を開く）。戻すときはコミットを revert するだけでよい。
