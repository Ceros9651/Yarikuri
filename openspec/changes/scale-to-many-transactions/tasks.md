# Tasks

## 1. 計測の準備

- [ ] 1.1 1万件（10年分、複数の口座・カテゴリ、収入・出費・振替・残高調整を含む）の取引を作るテスト用の関数を `src/test/` に加え、同じ内容を Playwright の `browser_evaluate` から IndexedDB に入れられるスクリプトを scratch に用意する。変更前のコードで `npm run dev` のアプリに入れ、Chrome の CPU スロットリング 4x で「入力画面で保存を押してから保存完了の表示が出るまで」「ホーム・取引一覧の月の切り替え」の時間を `performance.now()` で測り、変更前の値として記録する

## 2. 増減の表と残高の算出

- [ ] 2.1 `src/domain/balance.ts` に、口座×月の増減の型 `BalanceDelta`、取引の列から増減を作る `buildBalanceDeltas`、`balancesAtMonthEnd(accounts, deltas, month)`、`balanceAsOf(account, deltas, monthTransactions, date, excludeId?)` を加える。`src/domain/balance.test.ts` に、無作為に作った複数年分の取引（月をまたぐ振替、負の残高調整、クレジットカードを含む）について、各月末で `computeBalances(..., lastDayOfMonth(month))` と、任意の日付・除外 id で `computeBalance` と一致するテストを足し、`npm test -- balance` が通ることを確認する
- [ ] 2.2 `src/db/db.ts` に version 4（`balanceDeltas: '[accountId+month]'`）を加え、全取引から増減の表を作り直す `rebuildBalanceDeltas` を upgrade から呼ぶ。version 3 の DB に取引を入れてから version 4 で開き直すと、増減の表から求めた残高が全件から求めた残高と一致するテストを `src/db/` に足し、`npm test -- db` が通ることを確認する
- [ ] 2.3 `db.use()` で取引の表の `mutate`（`add`・`put`・`delete`・`deleteRange`）を包み、同じトランザクションで旧の増減を引いて新の増減を足すミドルウェアを入れる（合計 0 の行は消す、`clear()` では増減の表も空にする、トランザクションに `balanceDeltas` がなければエラーを投げる）。追加・同じ月での編集・月をまたぐ編集・口座を変える編集・削除・`bulkPut`・`clear` のそれぞれのあとで、増減の表から求めた残高が全件から求めた残高と一致すること、`balanceDeltas` を含まないトランザクションでの書き込みがエラーになり取引も書かれないことをテストし、`npm test -- db` が通ることを確認する

## 3. 書き込み経路

- [ ] 3.1 `src/test/` に、取引を `balanceDeltas` を含むトランザクションで入れるテスト用の関数を加え、`home.test.tsx`・`transactions.test.tsx`・`expenseTab.test.tsx` などの `db.transactions.bulkAdd` の直接呼び出しを置き換える。`npm test` が通ることを確認する
- [ ] 3.2 `src/db/repository.ts` の `saveTransaction`・`deleteTransaction` のトランザクションに `db.balanceDeltas` を加え、残高調整の差額を、その口座の増減の表と調整日の月の取引から `balanceAsOf` で求める。`getBudgetAlert` は保存した取引の月の取引だけを読む。`src/db/repository.test.ts` の既存の残高調整・予算アラートのテストが通り、過去の月の取引を編集・削除したあと以後の月末の残高が変わるテストを足し、`npm test -- repository` が通ることを確認する
- [ ] 3.3 `src/sync/engine.ts` の `apply` と `replaceWithCloud`、`src/db/backup.ts` の `importData` のトランザクションに `db.balanceDeltas` を加える。`engine.test.ts` に「取引の追加・変更・削除を受信したあと」「クラウドのデータに置き換えたあと」、`backup.test.ts` に「インポートしたあと」の増減の表から求めた残高が全件から求めた残高と一致するテストを足し、`npm test -- engine backup` が通ることを確認する

## 4. 画面の読み込み

- [ ] 4.1 `src/hooks/useData.ts` の `useAllData()` を `useMonthData(month)` に置き換え、口座・カテゴリ・予算・増減の表・選択月の取引（`date` の索引の範囲）・取引の件数（`count()`）を1つのトランザクションで返す。`HomePage.tsx` は残高を `balancesAtMonthEnd` で求め、「まずは設定で…」の案内を件数で判定する。`TransactionsPage.tsx` は月の取引をそのまま使う。`npm test -- home transactions expenseTab` の既存のテストがすべて通ることを確認する
- [ ] 4.2 口座・日付・除外する取引 id を受け取り、その口座の増減の表と日付の月の取引から残高を返す `useBalanceAsOf` を `useData.ts` に加え、`TransactionForm.tsx`（残高調整の「現在の残高」）と `EditTransactionPage.tsx`（残高調整の「実際の残高」の初期値）の `useTransactions()` を置き換える。`useTransactions()` を削除し、`grep -rn "useTransactions\|db.transactions.toArray" src` が取引を全件読む箇所としてバックアップのエクスポートと `rebuildBalanceDeltas` だけを返すことを確認する。残高調整の入力・編集のテスト（`repository.test.ts`・`transactions.test.tsx` など既存のもの）が通ることを `npm test` で確認する
- [ ] 4.3 ホームで別の月の取引を同期の受信で書き込んでも、表示中の月の取引の読み込みが再実行されないこと（`useMonthData` の読み込み回数）と、表示中の月の取引を書き込むと再実行されて残高・収支が更新されることをテストし、`npm test -- home` が通ることを確認する

## 5. 確認

- [ ] 5.1 `npm run lint`・`npm run typecheck`・`npm test` がすべて通ることを確認する
- [ ] 5.2 1.1 と同じ手順で、1万件の取引を入れたアプリを Chrome の CPU スロットリング 4x で測り、保存から保存完了の表示（予算アラートを含む）までと、ホーム・取引一覧の月の切り替えが 200ms 以内に収まること、変更前の値より短くなっていることを確認して記録する。あわせて、同じデータで変更前と変更後のホーム（複数の月）の残高・収支・カテゴリ別の出費・カード別の利用額・予算と、取引一覧のカレンダーの金額が一致することを見比べる
- [ ] 5.3 version 3 の DB（変更前のアプリで記録したデータ）を残したまま変更後のアプリを開き、upgrade のあとの残高と月の集計が変更前と同じであることを確認する
