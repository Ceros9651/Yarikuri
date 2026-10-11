# Design

## Context

- 入力欄のスタイルは `src/index.css` の `input, select, textarea` にまとめて書かれており、`width: 100%; min-width: 0; padding: 10px 12px; border; border-radius: 8px; font-size: 16px` を指定している。
- 日付欄は `TransactionForm.tsx` の `<label className="field">` 内の `<input type="date">`。`.field` は `flex-direction: column` のフレックスコンテナ。
- iOS Safari（WebKit）は `type="date"` をネイティブの見た目（`-webkit-appearance: textfield` 相当の独自描画）で表示し、内部の日付表示部分が固有の最小幅を持つ。このため `width: 100%` と `box-sizing: border-box` を指定していても、欄が親の幅を超えて右側にはみ出す。また独自描画のため高さ・文字位置（中央寄せになる）も他の欄とずれる。
- `html, body` は `overflow-x: hidden` なので、はみ出した分は横スクロールではなく右端が切れて見える。

## Goals / Non-Goals

**Goals:**
- 日付欄を親（`.field`）の幅にぴったり収め、金額欄・メモ欄と左右の端・高さをそろえる。
- 日付欄の中の文字を他の欄と同じく左寄せにする。

**Non-Goals:**
- 独自の日付ピッカー（カレンダー UI）を作ること。端末標準のピッカーをそのまま使う。
- 日付の表示形式（例: 「2026/10/11」）を変えること。
- デスクトップのブラウザ向けの見た目調整（崩れないことだけ確認する）。

## Decisions

### 1. `input[type='date']` のネイティブの見た目を外す
`appearance: none`（`-webkit-appearance: none` も併記）を指定し、WebKit の独自描画をやめて通常の入力欄と同じ箱モデルで描画させる。これで `width: 100%` が効き、親の幅に収まる。

- 代替案: 親に `overflow: hidden` を付けて切る → はみ出し自体は見えなくなるが、右側の枠線が欠けたままになり見た目がそろわないため不採用。
- 代替案: `max-width: 100%` だけを足す → WebKit の固有の最小幅には効かないことがあるため、単独では不採用（併用は可）。

### 2. 高さと文字位置を他の欄にそろえる
`appearance: none` にすると iOS では高さが文字の高さまで縮み、値が中央寄せになることがある。次を指定してそろえる。
- `min-height` を金額欄と同じ高さ（`font-size 16px × line-height 1.5 + padding 上下 20px + border 2px` ≒ 46px）にする。
- `::-webkit-date-and-time-value { text-align: left; }` で日付の文字を左寄せにする。
- `display: block` にして、インライン要素としての余計なすき間を出さない。

### 3. スタイルは `src/index.css` の既存のフォーム部分に追加する
日付欄は `TransactionForm` にしかないが、入力欄の共通スタイルが `index.css` に集約されているため、そこに `input[type='date']` のセレクタで追記する。コンポーネント側のマークアップは変えない。

## Risks / Trade-offs

- [`appearance: none` で、ブラウザによってはカレンダーアイコン（▼など）が消える] → 欄をタップすればピッカーは開くので操作は変わらない。Android Chrome ではアイコン（`::-webkit-calendar-picker-indicator`）は残る。
- [jsdom ではレイアウトを計算しないため、自動テストではみ出しを検出できない] → 実機（iPhone の Safari と、ホーム画面に追加したアプリ）とデスクトップブラウザの開発者ツールのスマホ表示で目視確認する。
- [Android Chrome やデスクトップで見た目が変わる] → 両方で、幅・高さ・左寄せが他の欄とそろっていることを確認する。
