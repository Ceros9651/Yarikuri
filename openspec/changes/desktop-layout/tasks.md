# Tasks

## 1. PC 版の外枠とサイドバー

- [x] 1.1 `src/components/Layout.tsx` の `nav.tab-bar` の先頭に、アプリ名「Yarikuri」を文字だけで表示する要素（例: `span.nav-title`、リンクにしない）を加える。`aria-label="メインメニュー"` とリンクの構成は変えない。`Layout.test.tsx` に「メインメニューにアプリ名が表示され、リンクは 4 つのまま」のテストを足し、`npm test -- Layout` が通ることを確認する
- [x] 1.2 `src/index.css` の `:root` に `--sidebar-width: 200px` を足し、`.nav-title` をスマホ版では `display: none` にする。ファイル末尾に `@media (min-width: 1024px)` のブロックを作り、`.tab-bar` を画面左に固定した縦の列（`top: 0; bottom: 0; width: var(--sidebar-width)`、`border-right` で区切る）、`.tab` を「アイコン左・文字右」の左揃えの行、`.nav-title` を表示、`.app` を `max-width: none; padding-left: var(--sidebar-width)`、`.content` を下のタブバー用の余白なし・`max-width: 640px` の左寄せにする。`.tab-bar` が PC ではサイドバーであることをコメントに書く。`npm run dev` を開き、Playwright（または開発者ツール）の 1280×800 で、左にサイドバー・下にタブバーが無いこと、選択中の項目だけアイコンと文字が緑になること、設定画面を下までスクロールしてもサイドバーが残ることを確認する
- [x] 1.3 390×844 と 1023×768 で、見た目が変更前と同じ（下部タブバー、480px の 1 列、アプリ名が出ない）ことをスクショで確認する。ダークモード（`prefers-color-scheme: dark`）の 1280×800 で、サイドバーの背景・罫線・文字色が配色に合っていることも確認する

## 2. PC 版のホームを 2 列にする

- [x] 2.1 `src/pages/HomePage.tsx` で、「月の収支」「カテゴリ別の出費」を 1 つ目の `div.home-col`、「カード別の利用額」「予算」「残高」を 2 つ目の `div.home-col` で包み、2 つを `div.home-columns` で包む。`MonthSwitcher`・予算超過アラートは上、記録開始の案内は下の `home-columns` の外に置く。見出し・`data-testid`・セクションの順は変えない。`home.test.tsx` に「1 列目に月の収支とカテゴリ別の出費、2 列目にカード別の利用額・予算・残高がこの順で入る」「セクションの見出しの文書順が今と同じ」テストを足し、`npm test -- home` が通ることを確認する
- [x] 2.2 `src/index.css` の PC 版ブロックに、`.content:has(.home-columns) { max-width: 1040px }`、`.home-columns`（2 列のグリッド、`minmax(0, 1fr)` ×2、列の間は 48px 程度の余白、`align-items: start`）、`.month-switcher { max-width: 480px }` を足す。スマホ版の `.home-columns` / `.home-col` にはスタイルを付けない。1280×800 で、左列に月の収支・カテゴリ別の出費、右列にカード別の利用額・予算・残高が並び、差額と予算の見出しがスクロールせずに見えること、予算超過のあるデータでアラートが 2 列の上に横一杯に出ることを確認する。390×844 でホームの見た目が変更前と同じことも確認する（`.claude/skills/ui-review/fixtures/seed-sample-data.js` でサンプルデータを入れる）

## 3. デザイン方針の更新

- [x] 3.1 `docs/design-principles.md` の「余白とレイアウト」に、PC 版のルール（画面幅 1024px 以上で左のサイドバーにし、選択中は色だけで示す／本文はサイドバーの右に左寄せし、最大幅はホーム 1040px・その他 640px／ホームは 2 列で、列の間は罫線ではなく余白で区切る）を、由来 `desktop-layout` を付けて追記し、既存のルールと矛盾がないことを読み合わせて確認する

## 4. 確認

- [x] 4.1 `npm run lint` と `npm test` が通ることを確認する
- [x] 4.2 1280×800 のブラウザで入力画面に金額を入れ、ウィンドウを 1024px 未満に狭めると下部タブバーに切り替わり、入力した金額と選択中の月が残っていることを確認する
- [ ] 4.3 （ユーザーが実行）`/ui-review ホーム` などで PC 幅の見た目を確認する。実装担当はこのタスクにチェックを付けない
