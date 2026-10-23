# Tasks

## 1. PC 版の月の切り替えを、月名は左・‹ › は右にする

- [x] 1.1 `src/index.css` 末尾の `@media (min-width: 1024px)` ブロックで、`.month-switcher` を `justify-content: flex-start; gap: 8px` に、`.month-switcher h2` を `order: -1; margin-right: auto` にする。`MonthSwitcher.tsx` の DOM は変えない。`npm run dev` を開き、1280×800 の取引一覧で月名が左端、‹ › が右にまとまること、390px のスマホ表示では今までどおり「‹ 月名 ›」の並びであることを確認する
- [x] 1.2 同じブロックに `.content:has(.home-columns) .month-switcher { max-width: calc((100% - 48px) / 2) }` を足し、48px が `.home-columns` の `column-gap` と同じ値であることをコメントに書く。1280×800 と 1024×768 のホームで、月名の左端が差額の左端とそろい、次月ボタンの右端が左列の金額の右端を越えない（右列の上に出ない）ことを確認する。設定の予算セクションの月の切り替えも崩れていないことを確認する

## 2. PC 版のサイドバーを本文と同じ背景にする

- [x] 2.1 `src/index.css` の PC 版ブロックの `.tab-bar` に `background: var(--bg)` を指定し、`padding` の上を 32px（`.content` の上余白と同じ）にする。`.nav-title` を `line-height: 44px` にして下の余白を詰める。スマホ版の `.tab-bar` と `:root` は変えない。1280×800 のホームで、サイドバーと本文の背景が同じで境界が 1px の線 1 本だけであること、「Yarikuri」と月名が同じ高さにあることを、ライト・ダークの両方で確認する。取引一覧・入力・設定でもサイドバーの見た目が同じであることを確認する

## 3. 確認

- [x] 3.1 `npm run lint` と `npm test` が通ることを確認する
- [x] 3.2 （/ui-review --verify で見つかった点）PC 版の取引一覧・入力・設定では「Yarikuri」が見出し（h1）より約 7px 下にあり、spec の「本文の 1 行目と同じ高さ」を満たしていない。`src/index.css` の PC 版ブロックで `h1` を `line-height: 44px` にし、`margin` を調整して見出しの下の間隔が今と大きく変わらないようにする。1280×800 の取引一覧・入力・設定で「Yarikuri」と h1 の文字の中心がそろうこと、ホームの見た目（h1 は読み上げ用で非表示）が変わらないこと、390px のスマホ表示の h1 が変わらないことを確認する
- [x] 3.3 （/ui-review --verify で見つかった点）PC 版の取引一覧・設定の予算で、‹ › の右端が 480px で止まり、下の一覧やカードの右端とそろっていない。`src/index.css` の PC 版ブロックの `.month-switcher` から `max-width: 480px` を外し、親（本文・カードの内側）の幅いっぱいにする。ホームの `.content:has(.home-columns) .month-switcher` の指定はそのまま残す。1280×800 の取引一覧で › の右端が一覧カードの右端と、設定の予算で › の右端が保存・解除ボタンの右端とそろうこと、ホームの › の右端が左列の金額の右端のままであることを確認する
- [x] 3.4 （/ui-review --verify で見つかった点）PC 版の設定の予算セクションで、左寄せになった月名（1.1rem）が見出し「予算」（1rem）より大きく、2 つ目の見出しに見える。`src/index.css` の PC 版ブロックに `.card .month-switcher h2 { font-size: 1rem }` を足し、カードの中の月の切り替え（設定の予算）だけ月名を見出しより大きくしない。1280×800 の設定で月名が「予算」の見出しより大きくないこと、ホーム・取引一覧の月名の大きさが変わらないことを確認する
- [x] 3.5 `npm run lint` と `npm test` が改めて通ることを確認する
- [x] 3.6 （ユーザーが実行）`/ui-review --verify ui-refine-home-2` で Before/After を確認する。実装担当はこのタスクにチェックを付けない
