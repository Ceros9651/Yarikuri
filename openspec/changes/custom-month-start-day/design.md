# Design

## Context

- 「月」は `'YYYY-MM'` の文字列で表し、範囲は暦月に固定されている。範囲の前提はコードのあちこちに散らばっている。
  - `readMonthTransactions(db, month)` が `${month}-01`〜`${month}-31` を読む（`src/db/queries.ts`）
  - `summarizeMonth` が `tx.date.startsWith(`${month}-`)` で絞る（`src/domain/summary.ts`）
  - `budgetAlertFor` と `getBudgetAlert` が `monthOf(tx.date)` で取引の月を決める（`src/domain/budget.ts`、`src/db/repository.ts`）
  - `calendarWeeks(month)` が暦月の 1日〜末日を並べる（`src/domain/calendar.ts`）
  - `TransactionsPage` の日付の絞り込みが `dateParam.startsWith(`${month}-`)` で月に含まれるかを見る
  - `MonthProvider` が `monthOf(new Date())` で今月を決める
  - ホームの残高は `balancesAtMonthEnd(…, month)` で、暦月ごとの増減を `d.month <= month` まで足す
- 口座×月の残高の増減（`balanceDeltas`）は暦月をキーにした端末内だけの派生データで、取引の書き込みのたびにミドルウェアが更新する。
- 同期は `SYNC_TABLES` に並んだ表を同じ仕組みで送受信する（outbox、カーソル、初回サインインの保存・置き換え）。Firestore のルールはコレクション名を許可リストで絞っている。
- バックアップは version 2（口座・カテゴリ・取引・予算）。

## Goals / Non-Goals

**Goals:**
- 月の範囲の決め方を 1 か所（期間を求める関数）にまとめ、各画面・集計はそれを通して範囲を得る。
- 開始日が 1日のときは、今までと完全に同じ結果になる（既存のテストがそのまま通る）。
- 開始日を変えても、保存済みのデータ（取引・予算・増減の表）を書き換えずに済む。

**Non-Goals:**
- 29日〜31日の開始日、月ごとに違う開始日、「土日なら前の営業日」のような調整。
- 期間を終了日の月で呼ぶ方式への切り替え（呼び方は開始日の月で固定）。
- クレジットカードごとの締め日・引き落とし日の管理。

## Decisions

### 1. 月は今までどおり `'YYYY-MM'` の名前で持ち、範囲は開始日から求める

月の名前（`'2026-10'`）と開始日（6）から範囲 `{ start: '2026-10-06', end: '2026-11-05' }` を求める関数と、日付と開始日から属する月の名前を求める関数を `src/domain/date.ts` に置く。

- `periodRange(month, startDay)` → `{ start, end }`。`end` は翌月の `startDay - 1` 日。`startDay = 1` なら翌月 0 日 = 当月末日。
- `periodOf(date, startDay)` → 日の部分が `startDay` 未満なら前の月、そうでなければその月。`monthOf` と同じく文字列と `Date` を受け取る。
- `isInPeriod(date, range)` は `start <= date && date <= end` の文字列比較。

予算の記録・MonthContext・URL などは月の名前のまま変えない。開始日が 28日以下なので、どの月にも開始日と終了日が必ず存在し、短い月の丸めは要らない。

代替案: 範囲（開始日と終了日）そのものを状態として持つ。予算の記録のキーや月の切り替えの計算をすべて作り直すことになり、開始日を変えたときに「同じ月」を保てないので採らない。

### 2. 期間の範囲を受け取る形に関数をそろえる

- `readPeriodTransactions(db, range)` を `queries.ts` に追加し、`date` の索引で `start`〜`end` を読む。月の集計・予算アラートはこれを使う。
- `readMonthTransactions(db, month)`（暦月）は残高の計算（`useBalanceAsOf`、残高調整の保存）に残す。残高は暦月の増減の表と組み合わせて求めるので、暦月の取引が必要なため。
- `summarizeMonth(range, …)`、`summarizeBudgets(month, range, …)`、`budgetAlertFor(tx, startDay, …)` のように範囲や開始日を受け取る形に変え、`startsWith` での判定をなくす。
- `useMonthData(month)` は開始日を読んで範囲を求め、`MonthData` に `range` を加えて返す。読み込みの依存に開始日を含め、開始日が変わったら読み直す。

### 3. 月の最終日時点の残高は、暦月の増減と期間の取引から求める

`balanceDeltas` は暦月のまま変えない。期間の最終日 `end` の残高は、`monthOf(end)` より前の暦月の増減の合計に、`monthOf(end)` の暦月で日付が `end` 以下の取引を足して求める。既存の `balanceAsOf` がこの計算そのものなので、`balancesAtMonthEnd` を `balancesAsOf(accounts, deltas, periodTransactions, end)` に置き換えて `balanceAsOf` を口座ごとに呼ぶ。

期間の取引は `monthOf(end)` の 1日〜`end` をすべて含む（開始日が 1日なら期間 = 暦月、それ以外なら終了日の暦月の 1日〜`startDay - 1` 日は期間の後半そのもの）ので、追加の読み込みは要らない。

代替案: 増減の表を期間ごとのキーにする。開始日を変えるたびに表を作り直す必要があり、同期で開始日が届いた瞬間にも作り直しが走るので採らない。

### 4. 設定は同期する新しい表 `settings` に 1 件で持つ

- 型 `AppSettings { id: 'app'; monthStartDay: number }` を `types.ts` に追加する。記録がなければ `monthStartDay = 1` として扱う。
- Dexie の version 5 で `settings: 'id'` を追加する。既存の端末は表が空のまま＝1日なので、移行処理は要らない。
- `SYNC_TABLES` に `'settings'` を加え、`docId` は `id`（`'app'`）。`remote.ts` の検証スキーマに `settingsSchema`（`monthStartDay` は 1〜28 の整数）を足す。送受信・初回サインインの保存と置き換え・インポート後の再送は、`SYNC_TABLES` を回る既存の処理でそのまま扱われる。
- `firestore.rules` の許可するコレクションに `'settings'` を加える。
- 書き込みは `setMonthStartDay(day)` を `repository.ts` に置き、検証（1〜28 の整数）してから `put` と `markDirty` を同じトランザクションで行う。
- 読み込みは `useMonthStartDay()` を `useData.ts` に置く（読み込み中は undefined）。リポジトリ側（予算アラート）は同じトランザクションで `settings` を読む。

代替案: `meta` の表に置く。`meta` は同期しない端末の記録用で、同期させるには別の仕組みが要るので採らない。`localStorage` も同じ理由で採らない。

### 5. MonthContext は「選んだ月」と「今月」を分けて持つ

`MonthProvider` の状態を `selected: string | null`（null は今月のまま）にし、`month = selected ?? periodOf(today, startDay)` とする。開始日が変わったとき、ユーザーが月を選んでいなければ今月が新しい開始日で求め直され、選んでいれば同じ名前の月のまま範囲だけが変わる（spec の「月の開始日の設定」）。`setMonth` は `selected` を設定する。`useMonth()` は `{ month, range, startDay, setMonth }` を返し、画面は `range` を使う。

開始日の読み込みが終わるまでは `MonthProvider` の子を描画しない。端末内の 1 件の読み込みなので待ち時間は無視できる一方、暦月で一瞬描画してから期間に切り替わるちらつきと、間違った範囲での読み込みを避けられる。

### 6. カレンダーは範囲の日付を並べる

`calendarWeeks(range)` は `start` の曜日の数だけ空き枠を置き、`start`〜`end` の日付を順に並べ、最後の週を空き枠で埋める。日の枠の表示ラベルは、範囲が 2 つの暦月にまたがるとき、範囲の最初の日と後の暦月の 1日だけ `M/D`、それ以外は日だけにする（ラベルを求める関数を `calendar.ts` に置く）。罫線・揃えなど見た目のルールは `docs/design-principles.md` のカレンダーの項に従い、変えない。

`TransactionsPage` の日付の絞り込みは `isInPeriod(dateParam, range)` で範囲内かを判定する。見出し「10月の取引」と「10月14日の取引」は今までどおり月名・日付から作る。

### 7. 画面の追加と変更

- 設定画面に「月の開始日」のセクションを、カテゴリと予算のあいだに置く（予算の「月」がこの設定で決まるため、予算の前に読める位置にする）。中身は、見出し、1日〜28日の `<select>`（ラベル「月の開始日」）、その下に「今月は 10月6日〜11月5日」の 1 行。選んだら直ちに保存し、保存ボタンは置かない。設定画面の他のセクション（口座・カテゴリ・予算など）と同じ `section.card` の見出し＋説明＋本文の並びにし、この画面だけ違う見た目にしない。
- 月の切り替え（`MonthSwitcher`）は、開始日が 1日以外のとき、月名の後に期間「10月6日〜11月5日」を小さい文字・控えめな色で出す。前月・次月のボタンの位置と読み上げの順（前月・月名・次月）は変えず、期間は月名と同じ見出しの要素の中に置いて一緒に読まれるようにする。期間の文言は `formatPeriodLabel(range)` を `date.ts` に置く。
- 予算の設定（`BudgetsSection`）は `useMonth()` の月名をそのまま使うので変更は要らないが、月の切り替えに期間が出ることで範囲が分かる。

### 8. バックアップは version 3 にして設定を含める

`BackupData` に `settings: { monthStartDay: number }` を加え、`BACKUP_VERSION = 3` とする。version 1・2 のファイルは `monthStartDay = 1` として読み込む。version 3 で `settings` がない・範囲外の値のファイルは形式エラーにする。`importData` は `settings` の表も置き換え、置き換え前後の docId を outbox に積む（既存の `SYNC_TABLES` のループに含まれる）。

## Risks / Trade-offs

- [新しい端末のアプリが `settings` を送ったとき、Firestore のルールが古いと権限エラーで同期が止まる] → ルールのデプロイをアプリの公開より先に行う（Migration Plan）。
- [古いバージョンのアプリが残っている端末は `settings` を受け取らず、暦月のまま表示する] → 古いアプリは `settings` のコレクションを購読しないだけで、データは壊れない。アプリの更新が届けば揃う。
- [開始日を変えると、過去の月の集計・予算の判定がさかのぼって変わる] → 設定の説明に、すべての月の範囲が変わることが分かる文言（今月の範囲の表示）を出す。予算の記録は月の名前で残るので失われない。
- [`useMonthData` が範囲で読むようになり、期間が 2 つの暦月にまたがる] → `date` の索引の範囲読みなので件数は暦月と同程度で、`記録が多くても操作が遅れない` の前提を崩さない。
- [`MonthProvider` が開始日の読み込みを待つあいだ何も描画しない] → 端末内の読み込みで数ミリ秒。テストでは `findBy…` で待つ既存の書き方で吸収できる。

## Migration Plan

1. `firestore.rules` に `settings` を加えてデプロイする。
2. アプリを公開する。Dexie は version 5 へ自動で上がり、`settings` は空（= 1日）で始まる。
3. 戻すときは、アプリを前のバージョンに戻す。`settings` の表と Firestore のコレクションは残っても古いアプリは読まないので害はない。version 3 のバックアップは古いアプリでは読み込めない（バージョン非対応のエラーになる）。
