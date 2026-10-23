# Design

## Context

- スタイルは `src/index.css` の 1 ファイル（素の CSS、`:root` の CSS 変数＋クラス名）。メディアクエリは今はダークモードの切り替えだけで、幅による分岐はない。
- `.app` は `max-width: 480px; margin: 0 auto` で全画面共通の 1 列。`.content` は下部タブバーの高さぶん下に余白を持つ。`.tab-bar` は `position: fixed; bottom: 0` で横一杯、`.tab` は `max-width: 120px` の縦積み（アイコンの下に文字）。
- ナビゲーションは `Layout.tsx` の `nav.tab-bar`（`aria-label="メインメニュー"`）1 つで、`NavLink` が選択中に `.active` と `aria-current="page"` を付ける。`Layout.test.tsx` はこの名前とリンク名で検証している。
- ホーム（`HomePage.tsx`）は `MonthSwitcher` → 予算超過アラート → `section.month-summary` → `section.home-section` ×4 → 記録開始の案内、が兄弟要素として並ぶ。
- テストは jsdom（Vitest）で動き、メディアクエリの見た目は評価できない。見た目は Playwright で確認する（`/ui-review` と同じ手順）。
- デザインのルールは `docs/design-principles.md`（箱で囲まない、色は `--primary` に絞る、余白に段階を付ける、左揃え）。

## Goals / Non-Goals

**Goals:**

- 1024px 以上で、サイドバー＋広い本文のレイアウトに CSS だけで切り替える。
- スマホ版の DOM と見た目を変えない（追加する要素はスマホ版で見た目に影響しない）。

**Non-Goals:**

- 取引一覧と編集の左右分割、設定の段組みなど、ホーム以外の画面の構成変更（PBI の次の段階で検討する）。
- 768〜1023px（タブレット縦）専用のレイアウト。今のスマホ版のまま。
- ホバー表示・キーボードショートカットなど PC 固有の操作の追加。

## Decisions

### 1. 切り替えは CSS のメディアクエリ `@media (min-width: 1024px)` だけで行う

- 1 つの DOM を CSS で見せ分ける。`matchMedia` を使う React のフック（`useIsDesktop` など）で別コンポーネントを描き分ける案は採らない。
- 理由: 画面幅を変えても再マウントが起きず、入力中の内容や選択中の月が残る（spec の「ウィンドウの幅を変える」シナリオ）。初回描画のちらつきもない。テストも今の DOM 構造のまま通る。
- 境界値 1024px はユーザーの選択。CSS 変数はメディアクエリの条件に使えないので、`index.css` 内の各メディアクエリに `1024px` を直書きし、PC 版のブロックは 1 か所（ファイル末尾）にまとめて重複を避ける。

### 2. ナビゲーションは同じ `nav` を、PC ではサイドバーとして見せる

- `nav.tab-bar` に PC 用の見た目を足す。PC 版では `position: fixed; top: 0; bottom: 0; left: 0; width: 200px` の縦の列にし、`border-top` の代わりに `border-right` で本文と区切る。`.tab` は横並び（アイコン左・文字右）、左揃え、`max-width` を外し、高さは 44px 程度。選択中は今と同じく `color: var(--primary)` と太字のみで、背景の塗りや角丸の囲みは付けない（デザイン方針「アクセント色は選択状態に絞る」「箱で囲まない」）。
- サイドバー上端にアプリ名「Yarikuri」を文字だけで置く（ロゴ・アイコンは付けない）。スマホ版では `display: none`。`nav` の中に置くとリンクではないのでテストの `getByRole('link')` には影響しない。
- 別の `aside` を新設してスマホ用 `nav` と出し分ける案は、リンクが 2 組になり `getByRole('link', { name: /設定/ })` が複数一致してテストが壊れ、読み上げでもメニューが 2 つになるので採らない。
- クラス名 `.tab-bar` / `.tab` は PC ではタブバーではなくなるが、名前の変更はテストやスマホ版のスタイルに波及するため今回は変えない。

### 3. PC 版の外枠

- `.app` を `max-width: none` にし、`padding-left: 200px`（サイドバーの幅）で本文をサイドバーの右に置く。サイドバーの幅は `--sidebar-width: 200px` として `:root` に足し、`.tab-bar` の幅と `.app` の左余白の両方で使う。
- `.content` は下のタブバー用の余白をやめ、上下 32px・左右 40px 程度にする。本文の最大幅は画面ごとに変える:
  - ホーム: `max-width: 1040px`（2 列）
  - それ以外（取引一覧・入力・編集・設定）: `max-width: 640px`（1 列。一覧の行や入力欄が横に間延びしない幅）
- 本文はサイドバーの右に左寄せにする（中央寄せにしない。デザイン方針「均一な余白と中央寄せ」を避ける）。
- 画面ごとの最大幅は、PC 版の `.content` の既定を `max-width: 640px` にし、ホームの 2 列（決定 4 の `.home-columns`）を含むときだけ `.content:has(.home-columns)` で 1040px に広げる。`:has()` は対象ブラウザ（Safari 15.4+、Chrome / Edge 105+）で使え、`Layout` にページごとの幅の知識を持たせずに済む。
  - 代案: `Layout` が `useLocation` で `/` かどうかを見てクラスを付ける案は、ルートとレイアウトが結び付き、ホームのパスを変えたときに壊れるので採らない。

### 4. ホームの 2 列は、DOM の順を変えずに 2 つの列要素で包む

- `HomePage.tsx` で「月の収支」「カテゴリ別の出費」を `div.home-col` 1 つ目、「カード別の利用額」「予算」「残高」を `div.home-col` 2 つ目で包み、2 つを `div.home-columns` で包む。`MonthSwitcher`、予算超過アラート、記録開始の案内は `home-columns` の外（上・下）に置く。
- スマホ版の `.home-columns` / `.home-col` は `display: block` 相当でスタイルを持たないので、見た目は今と同じ。PC 版で `.home-columns { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); column-gap: 48px; align-items: start }`。
- 列の間は罫線を引かず余白で区切る（「セクション間は余白で区切る」ルールと同じ考え方）。
- 代案: ラッパーなしで `.content` を `grid-template-areas` にしてセクションごとに配置する案は、ホームのセクションが `.content` の直下ではない（`Outlet` 経由で `BudgetAlertNotice` と並ぶ）うえ、セクションの高さが違うと行がそろって大きな空白ができるので採らない。CSS の `columns`（多段組）は、どのセクションがどちらの列に入るかが内容の量で変わり、spec の配置を保証できないので採らない。
- DOM の順は今と同じなので、読み上げの順番と既存のテストはそのまま。

### 5. 月の切り替えの幅

- PC 版のホームで `MonthSwitcher` が 1040px いっぱいに広がると前後のボタンが離れすぎるので、PC 版では `.month-switcher` に `max-width: 480px` を付け、左寄せにする。

### 6. デザイン方針への追記

- `docs/design-principles.md` の「余白とレイアウト」に、PC 版のルール（1024px 以上でサイドバー、本文は左寄せで最大幅を画面ごとに決める、ホームは 2 列で列の間は余白）を由来 `desktop-layout` 付きで追記する。

## Risks / Trade-offs

- [`:has()` 非対応の古いブラウザでは、ホームも 640px の 1 列になる] → 内容は 2 列が 1 列に縮むだけで欠けない。対象はスマホが主で、PC は最近の Chrome / Edge / Safari を想定するため許容する。
- [jsdom ではメディアクエリの見た目を検証できない] → 単体テストは DOM の構造（列の要素と順番、サイドバーのアプリ名）を確かめ、見た目は Playwright で 1280×800 と 390×844 のスクショを撮って確認する。
- [右列（カード・予算・残高）が左列より長くなり、下に空白が偏る] → 各列は上詰め（`align-items: start`）で、空白は下にできるだけにする。偏りが大きければ `/ui-review` で列の分け方を見直す。
- [`.tab-bar` という名前が PC ではサイドバーを指し、読み手が混乱する] → `index.css` の PC 版ブロックにコメントで明記する。名前の変更は別の change で行う。
- [`env(safe-area-inset-*)` の余白がサイドバー表示時に二重になる] → PC 版の `.content` / `.tab-bar` では safe-area の余白を下ではなく左右だけ考慮する（実質 0 になる環境が大半）。

## Migration Plan

- CSS と DOM の追加だけで、データの移行はない。GitHub Pages への通常のデプロイで反映され、Service Worker の更新で次回起動から新しい見た目になる。戻すときはこの change のコミットを revert する。
