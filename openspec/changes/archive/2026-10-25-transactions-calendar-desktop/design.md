# Design

## Context

- PC 版は `src/index.css` 末尾の `@media (min-width: 1024px)` ブロックで、同じ DOM を CSS だけで見せ分けている（desktop-layout の決定 1）。本文の最大幅は既定 640px、`.content:has(.home-columns)` のときだけ 1040px。月の切り替えはホームでは `.content:has(.home-columns) .month-switcher` で左列の幅にそろえている。
- `TransactionsPage.tsx` は `MonthSwitcher` → `.tx-filters`（カテゴリ・支払元の `FilterChips`）→ `section.card`（取引の `ul.list`）の 1 列。絞り込みは URL の `category` / `account` で持ち、`setSearchParams(..., { replace: true })` で変える。行を押すと `state.returnTo` に `/transactions${location.search}` を渡し、編集画面の保存・削除後にそこへ戻る。
- 月の集計は `domain/summary.ts` の `summarizeMonth`（振替・残高調整を含めない）。日付は文字列 `'YYYY-MM-DD'` で、`domain/date.ts` に `todayString` / `lastDayOfMonth` がある。
- テストは jsdom（Vitest）でメディアクエリを評価できない。見た目は Playwright で確認する。

## Goals / Non-Goals

**Goals:**

- PC 版の取引一覧にカレンダーと日付の絞り込みを加え、左右 2 列にする。
- PC 版のホーム・取引一覧を画面幅いっぱいに広げ、広い画面で右が空かないようにする。
- スマホ版の見た目と、既存の絞り込み・戻り先の動きを変えない。

**Non-Goals:**

- スマホ版でのカレンダー表示や、週表示・年表示などの別の表示単位。
- 日の枠の中に取引の内訳（カテゴリ名など）を並べること。
- 入力画面からカレンダーの日付を初期値にして新規入力する導線。

## Decisions

### 1. カレンダーは常に DOM に置き、スマホ版では CSS で隠す

- desktop-layout と同じく、`matchMedia` のフックで描き分けず、`.tx-calendar` をスマホ版では `display: none`、PC 版で表示する。画面幅を変えても再マウントや状態の消失が起きず、jsdom のテストでもカレンダーの DOM を検証できる。
- 代案: `useIsDesktop` で PC のときだけ描く案は、テストでメディアクエリを偽装する必要があり、既存方針とも外れるので採らない。

### 2. 2 列は `div.tx-columns` > `div.tx-col` ×2 で包む

- 1 列目に `MonthSwitcher` と `.tx-calendar`、2 列目に `.tx-filters`・日付の絞り込み中の表示・`section.card` を入れる。スマホ版ではラッパーにスタイルを付けず、カレンダーは非表示なので、見た目も読み上げの順も今と同じ（月の切り替え → 選択肢 → 一覧）。
- PC 版では `.content:has(.home-columns), .content:has(.tx-columns)` の最大幅をなくし（`max-width: none`）、サイドバーの右の画面幅いっぱいに広げる。1040px の左寄せでは 1920px の画面で右が 700px 以上空き、「左に寄って見える」ため（実装後の確認でユーザーが指摘）。中央寄せ（最大幅を残して左右の余白をそろえる）はデザイン方針「中央寄せにしない」の例外になるので採らない。
- `.tx-columns` はホームと同じ `column-gap: 48px; align-items: start` で、列の幅はカレンダーを広く `minmax(0, 3fr) minmax(0, 2fr)` にする。右列の一覧は 2/5 でも 1280px で約 380px あり、行が窮屈にならない。
- 左列（月の切り替えとカレンダー）は `position: sticky; top: 32px` にし、右列の長い一覧をスクロールしても見えたままにする。
- 月の切り替えは左列の中に入るので、ホームのような幅の上書きは要らない。

### 3. 日ごとの集計とカレンダーの並びは domain の純粋関数にする

- `src/domain/calendar.ts` に次を置き、`calendar.test.ts` で単体テストする:
  - `dailyTotals(transactions): Map<string, { expense: number; income: number }>` — 渡された取引を日付ごとに足す。収入・出費だけを数え、振替・残高調整は無視する。
  - `calendarWeeks(month): (string | null)[][]` — 日曜始まりの週ごとの行で、月の外の枠は `null`。
- 月の取引と絞り込みの適用は `TransactionsPage` 側で行い、`dailyTotals` にはカテゴリ・支払元で絞り込んだ後（日付の絞り込みの前）の取引を渡す。カテゴリ・支払元の絞り込み中は既存の `matchesCategory` / `matchesAccount` が出費だけを通すので、収入は自然に 0 になり表示されない。spec の「絞り込みに連動して収入を出さない」をそのまま満たす。
- `summarizeMonth` を拡張する案は、ホームの集計の型に日ごとのデータが混ざり、絞り込み後の取引を渡す使い方とも合わないので採らない。

### 4. 日付の絞り込みは URL の `date` に持たせる

- `?date=YYYY-MM-DD`。既存の `setFilter` を `'category' | 'account' | 'date'` に広げ、`replace: true` で履歴を増やさない。編集の戻り先は `location.search` をそのまま使うので、日付も自動で引き継がれる。
- 有効な日付は「`date` が選択中の月に含まれるとき」だけとし、それ以外は絞り込みに使わない。月を切り替えたら `useEffect` で `date` を URL から消す（`replace: true`）。月は `MonthContext` の状態で URL に無いため、月の切り替えを URL の変化から検知できないことによる。
- 絞り込み中の表示は、選択肢と一覧の間（一覧の真上）に「10月5日の取引」＋ 解除（`button.link`）の 1 行として置く。絞り込む対象のすぐ上に置くため。カレンダーが隠れるスマホ版でも表示するので、PC で日付を選んでから窓を狭めても解除できる。

### 5. 日の枠はボタンにし、見た目は罫線の格子

- カレンダーを `container-type: inline-size` にし、日の枠の高さ・左右の余白・文字の大きさを `clamp()` と `cqi` でカレンダーの幅に合わせる（1280px で枠約 80px・金額 0.7rem、1920px で枠約 136px・金額 0.95rem）。メディアクエリを段階ごとに書くより、幅が連続的に変わっても破綻しない。
- 各日の枠は `button` で、`aria-pressed` で選択状態、`aria-label` に「10月5日 出費 ¥2,000 収入 ¥3,000」のように日付と金額を入れる。今日の枠には `aria-current="date"` を付ける。月の外の枠は空の `div`。
- 格子は 7 列の CSS グリッドで、週の区切りは横の 1px の罫線（`--border`）だけにする（縦の罫線を引くと枠が箱に見えるため）。カードの角丸や影、枠ごとの背景の塗りは付けない（デザイン方針「箱で囲まない」）。
- 日付は枠の左上に小さく、金額はその下に右揃えで「出費（`--expense`）」「収入（`--income`）」の順に 2 行。出費は `-¥2,000`、収入は `+¥3,000` と取引一覧の金額と同じ符号の書き方にし、色だけに頼らず区別できるようにする。`formatYen` を使い、`white-space: nowrap` と `font-variant-numeric: tabular-nums` で桁を割らない。
- 今日は日付の数字を太字にして下線を付ける。選択中の日は日付の数字と枠の上辺（2px）を `--primary` にする（選択状態だけにアクセント色を使う方針）。
- 土日の色分けはしない（色は状態にだけ使う方針）。

### 6. デザイン方針への追記

- 「余白とレイアウト」の PC 版の最大幅のルールを「ホーム・取引一覧は画面幅いっぱい、それ以外 640px」に改め、取引一覧の 2 列（左: 月の切り替え・カレンダー、右: 選択肢・一覧）を由来 `transactions-calendar-desktop` 付きで追記する。カレンダーの格子は罫線で区切り、今日・選択中の示し方のルールも追記する。

## Risks / Trade-offs

- [左列の幅（約 496px）÷7 で枠が約 70px になり、6 桁の金額（`-¥123,456`）が収まらない] → 金額の文字を 0.7rem・枠の左右の余白を 4px にし（1280px 幅で `+¥268,000` が収まることを確認済み）、`nowrap` のまま枠からはみ出さないよう `overflow: hidden; text-overflow: ellipsis` を付ける。`aria-label` には全額が入る。実データで収まるかを Playwright で確認する。
- [月を切り替えた直後の 1 回の描画では、前の月の `date` が URL に残る] → 有効な日付を「選択中の月に含まれる」ものに限るので、表示上は絞り込まれない。effect で URL からも消す。
- [jsdom ではカレンダーが PC だけで見えることを検証できない] → 単体テストは DOM（枠の金額、押したときの絞り込み、解除、月の切り替え）を確かめ、表示の出し分けと 2 列は Playwright で 1280×800 と 390×844 のスクショで確かめる。
- [`:has()` 非対応の古いブラウザでは 640px の 1 列になり、カレンダーが一覧の上に縦に並ぶ] → desktop-layout と同じく許容する。
- [2560px 以上の画面ではホームの 1 行（項目名と金額）が横に長く、目で追いにくい] → 罫線で行をたどれるので当面は許容し、気になれば `/ui-review ホーム` で列数や最大幅を見直す。

## Migration Plan

- データの移行はない。通常のデプロイで反映し、戻すときはこの change のコミットを revert する。
