# Design

## Context

動機は proposal.md の Why を参照。現状のコードで重さの元になっているのは次の箇所。

- `useAllData`（`src/hooks/useData.ts`）が口座・カテゴリ・**全取引**・予算を1つの `useLiveQuery` で読む。ホームと取引一覧が使い、取引の表に書き込みがあるたびに全件を読み直す。
- `computeBalance`（`src/domain/balance.ts`）は初期残高から全取引を足し直す。ホームは表示中の口座の数だけこれを回す（口座数 × 全件）。
- `TransactionForm` と `EditTransactionPage` は `useTransactions()` で全取引を読み、残高調整の「現在の残高」「実際の残高」を求める。入力画面は開いているだけで全件を購読している。
- `getBudgetAlert`（`src/db/repository.ts`）は保存のたびに全取引を読み、`summarizeMonth` で月に絞る。
- `saveTransaction` の残高調整は `where('date').belowOrEqual(date)` で、ほぼ全件を読む。

取引の表には `date` の索引がすでにある（`transactions: 'id, date, accountId, toAccountId, categoryId'`）。日付は 'YYYY-MM-DD' の固定長文字列なので、文字列の範囲で月を切り出せる。

取引の表に書き込む経路は5つある：`saveTransaction`・`deleteTransaction`（repository）、同期の受信 `SyncEngine.apply`（`putRecord`/`deleteRecord` を表の種類によらず呼ぶ）、初めてのサインインでの置き換え `replaceWithCloud`（`clear` + `bulkPut`）、バックアップの `importData`（`clear` + `bulkAdd`）。テストでも `db.transactions.bulkAdd` を直接呼んでいる（home / transactions / expenseTab のテスト）。

## Goals / Non-Goals

**Goals:**

- 保存1回あたりに読む取引を「表示中の月」と「保存した取引の月」の分だけにする。
- 残高を求める計算量を、取引の件数ではなく「口座数 × 月数」に比例させる。
- どの書き込み経路を通っても、派生データ（後述の増減の表）が取引と食い違わないことを仕組みで保証する。

**Non-Goals:**

- 一覧の仮想スクロールなど描画の最適化（1か月分の行数は多くても数百件で、今回の対象外）。
- 同期の受信で大量の変更が一度に届いたときの処理の分割。
- 予算・口座・カテゴリの読み込みの最適化（件数が少ない）。
- 画面の見た目や操作の変更。

## Decisions

### 1. 画面は月の取引だけを `date` の索引で読む

`useAllData()` を `useMonthData(month)` に置き換え、取引は `db.transactions.where('date').between(`${month}-01`, `${month}-31`, true, true)` で読む。口座・カテゴリ・予算・増減の表と同じトランザクションで読み、今と同じく「名前が空の一瞬」を描画しない。

Dexie 4 の `liveQuery` は読んだ索引の範囲と表を購読する。残高の増減の表も同じ読み込みに含めるので、他の月の取引を書いても（その口座の増減が変わるため）読み直しは起きるが、そのとき取引の表から読むのは表示中の月の取引だけで、件数は全体の件数によらない。

月を切り替えた直後、`useLiveQuery` は新しい月を読み終えるまで前の月の結果を返す。結果に読んだ月を持たせ、ホームと取引一覧はその月の内容をそのまま出し続ける（0円や「取引はありません」が一瞬出ないようにする）。月の切り替えの表示は選んだ月にすぐ変わる。

ホームの「まずは設定で口座と…」の案内は「取引が1件もない」ことで出しているので、月の取引ではなく `db.transactions.count()` を同じ読み込みで返す（件数は索引から求まり、全件を読まない）。

- 代替案：全件を一度だけ読んでメモリに持ち、書き込みのたびに差分を当てる。起動時と同期での置き換え時に全件を読むのは同じで、liveQuery の再読み込みとの整合を自前で取る必要があるため採らない。

### 2. 口座×月の増減の表 `balanceDeltas` を持つ

新しい表 `balanceDeltas`（主キー `[accountId+month]`、値は `{ accountId, month: 'YYYY-MM', delta }`）を version 4 で加える。`delta` はその月の取引がその口座の残高を動かした合計（既存の `balanceDelta(tx, accountId)` の和）。合計が 0 になった行は消す。

- 初期残高は含めない。口座の初期残高を変えても表を直す必要がなく、残高は `initialBalance + Σdelta` で求まる。
- クレジットカードの行も他と同じに作る（残高の算出で `isAssetAccount` により使わない）。経路ごとに口座の種別を見ずに済む。
- 行数は「口座数 × 記録のある月数」（10口座 × 10年でも 1,200 行）なので、ホームでは表を全部読んでメモリで足す。

残高の求め方（`src/domain/balance.ts` に純粋関数として加える）：

- 月末の残高 `balancesAtMonthEnd(accounts, deltas, month)`：`initialBalance + Σ(delta | 行の month ≤ month)`。ホームの残高に使う。`computeBalances(accounts, 全取引, lastDayOfMonth(month))` と同じ値になる。
- ある日の残高 `balanceAsOf(account, deltas, monthTransactions, date, exclude?)`：`initialBalance + Σ(delta | 行の month < monthOf(date)) + Σ(その月の date 以前の取引の増減、exclude を除く)`。exclude（編集中の残高調整）は id ではなく保存済みの取引そのものを受け取り、前の月にあれば増減の合計に含まれているぶんを引き戻す（調整の日付を別の月に変える編集で必要）。残高調整の差額と「現在の残高」「実際の残高」に使う。`computeBalance(account, 全取引, date, exclude.id)` と同じ値になる。

既存の `computeBalance` / `computeBalances` は残し、テストで新しい関数の結果と照合する基準にする。

- 代替案：月末時点の残高そのもの（累計）を持つ。過去の月の取引を直すと以後のすべての月の行を書き換えることになり、書き込みが月数に比例する。増減なら書き換えは前後の月の2行までで済み、読む側の足し算は 1,200 行程度なので増減を採る。
- 代替案：残高を持たず、`accountId` の索引で口座ごとに読む。口座の取引は結局ほぼ全件で、改善にならない。

### 3. 増減の表は DBCore ミドルウェアで取引の表への書き込みと同時に更新する

`db.use()` で取引の表の `mutate` を包むミドルウェアを入れ、書き込みの前に既存の記録を同じトランザクションで読んで、旧の増減を引き新の増減を足す。

- `add` / `put`：対象キーの既存の記録を `getMany` で読み、旧を引いて新を足す。`Table.update` や `Collection.modify` も DBCore では `put` になる。
- `delete`：対象キーの既存の記録を読んで引く。
- `deleteRange`：範囲が全体（`clear()`）なら増減の表も空にする。部分的な範囲なら範囲の記録を読んで引く。

書き込むトランザクションに `balanceDeltas` が含まれていなければ、ミドルウェアはエラーを投げて書き込みを止める。取引だけが変わって増減の表が古くなる状態を作らないためで、書き込み経路の入れ忘れはテストで必ず落ちる。

これにより書き込み経路ごとに増減の計算を書く必要がなく、各経路はトランザクションの対象に `db.balanceDeltas` を加えるだけになる：

- `saveTransaction`・`deleteTransaction`：`'rw', db.accounts, db.transactions, db.balanceDeltas, db.outbox`。
- `SyncEngine.apply`：対象が `transactions` のときに `db.balanceDeltas` を加える（他の表では不要だが、常に加えても害はないので常に加える）。
- `replaceWithCloud`・`importData`：対象に加える。`clear` で表が空になり、`bulkPut`/`bulkAdd` で作り直される。
- テストで取引を直接入れている箇所は、`db.transaction('rw', db.transactions, db.balanceDeltas, …)` で包むテスト用の関数（`src/test/` に置く）に置き換える。

- 代替案：書き込み経路ごとに増減を更新する関数を明示的に呼ぶ。同期の受信は表の種類によらない汎用のコードで、経路が増えたときに入れ忘れても気づけないため採らない。
- 代替案：Dexie の `hook('creating' | 'updating' | 'deleting')`。他の表への書き込みはミドルウェアと同じくトランザクションの対象に含める必要があるうえ、`clear()` では呼ばれないため採らない。

### 4. 既存の端末では version 4 の upgrade で一度だけ作る

`this.version(4).stores({ ...v3, balanceDeltas: '[accountId+month]' }).upgrade(...)` で、upgrade のトランザクション内で全取引を一度読み、増減の表を作る。全件を読むのは更新後の初回起動の1回だけ。upgrade 内では増減の表に直接書くので、ミドルウェアの対象（取引の表への書き込み）にならない。

### 5. 予算アラートと残高調整は取引の月だけを読む

- `getBudgetAlert`：保存した取引の月の取引だけを読み、`budgetAlertFor` に渡す（`summarizeMonth` は月で絞るので結果は同じ）。
- `saveTransaction` の残高調整：その口座の増減の表の行と、調整日の月の取引だけを読み、`balanceAsOf` から差額を求める。
- `TransactionForm`・`EditTransactionPage`：`useTransactions()` をやめ、口座・日付・除外する保存済みの取引を受け取って残高を返す `useBalanceAsOf(accountId, date, exclude?)` に置き換える。残高調整以外の種類では読まない（accountId を渡さない）。引数を変えた直後に前の引数の結果を返さないよう、読み終えるまでは undefined（読み込み中）を返す。編集画面は「実際の残高」の初期値をフォームを作るときに一度だけ決めるため、前の結果で決めてしまわないようにする。

`useTransactions()`（全件）は使う箇所がなくなるので消す。

### 6. 速さの確認

fake-indexeddb 上の時間は実機と比べられないため、200ms の目安はテストの合否にしない。

- 単体テスト：無作為に作った複数年分の取引について、`balancesAtMonthEnd`・`balanceAsOf` が `computeBalance(s)` と一致すること。各書き込み経路（保存・編集・削除・同期の受信・置き換え・インポート・upgrade）のあとで、増減の表から求めた残高が全件から求めた残高と一致すること。
- 実機での計測：`npm run dev` のアプリに Playwright で 1万件（10年分）を入れ、Chrome の CPU スロットリング 4x で、入力画面の保存ボタンを押してから保存完了の表示が出るまで、ホーム・取引一覧の月の切り替えにかかる時間を `performance.now()` で測り、変更前と比べて記録する。

## Risks / Trade-offs

- [ミドルウェアが Dexie の内部の形（DBCore の mutate 要求）に依存する] → Dexie 4 の公開 API（`db.use`、`DBCoreMutateRequest`）だけを使い、`add`/`put`/`delete`/`deleteRange` のそれぞれについて、増減の表と全件からの残高の一致をテストする。Dexie を更新するときはこのテストが検知する。
- [増減の表が何らかの理由で取引と食い違う（想定外の不具合）] → 増減の表は派生データで、全取引から作り直せる。作り直す関数 `rebuildBalanceDeltas(db)` を upgrade と共用し、不具合が見つかったときは version を上げて作り直せるようにする。
- [`balanceDeltas` を対象に含めない書き込みはエラーになる] → 意図した振る舞い（食い違いを作らない）。テストの直接書き込みは専用の関数に置き換える。
- [月の範囲 `${month}-31` は存在しない日を含む] → 日付は 'YYYY-MM-DD' の文字列比較なので、存在しない日は範囲の上限としてだけ使われ、結果は月の全取引になる。
- [ホームの「取引が1件もない」の判定に `count()` を使い、取引の表全体を購読する] → `count()` は記録を読まないので軽い。取引の書き込みのたびに再実行されるのは今と同じで、読む量だけが減る。
- [version 4 にした DB は古いバージョンのアプリで開けない] → PWA の更新は前へ進むだけで、これまでの version 2・3 の追加と同じ扱い。増減の表は同期・バックアップに含めないので、他の端末やファイルとの互換性は変わらない。

## Migration Plan

1. version 4 を加えてデプロイすると、各端末は次の起動時に upgrade で増減の表を作る（全取引を一度読む）。
2. 同期・バックアップの形式は変わらないため、新旧のバージョンの端末が混在しても同期できる（増減の表は各端末で取引から作られる）。
3. 戻すときは、増減の表を使わないコードに戻しても version 4 の DB はそのまま開ける（表が余るだけ）。ただし Dexie の version は下げられないので、戻したコードでも `version(4)` の定義は残す。
