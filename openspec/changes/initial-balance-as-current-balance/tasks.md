# Tasks

## 1. 初期残高の逆算（ドメイン）

- [x] 1.1 `src/domain/balance.ts` に `initialBalanceFor(account, deltas, monthTransactions, date, targetBalance)` を追加し、`balanceAsOf` を使って「保存後に date 時点の残高が targetBalance になる初期残高」を返す（クレジットカードはエラー）。`src/domain/balance.test.ts` に、前の月の増減がある場合・当月の取引がある場合・date より後の取引がある場合・負の目標値の各ケースで `balanceAsOf` の結果が目標値と一致するテストを追加し、`npm test -- balance` が通ることを確認する

## 2. リポジトリの口座更新

- [x] 2.1 `src/db/repository.ts` の `updateAccount` を `changes: { name; currentBalance? }` に変え、`currentBalance` があるときだけ `accounts`・`transactions`・`balanceDeltas`・`outbox` の `rw` トランザクション内で `readAccountDeltas` と `readMonthTransactions(db, monthOf(todayString()))` を読み、`initialBalanceFor` で初期残高を保存する。ないときは初期残高を変えない。クレジットカードは常に 0
- [x] 2.2 `src/db/repository.test.ts` の「名前と初期残高を編集できる」を置き換え、(a) 前の月に出費がある口座で `currentBalance` を指定すると今日時点の残高がその値になる、(b) `currentBalance` を省くと名前だけ変わり `initialBalance` は変わらない、(c) クレジットカードは 0 のまま、の各テストを追加して `npm test -- repository` が通ることを確認する

## 3. 口座設定の画面

- [x] 3.1 `src/components/settings/AccountsSection.tsx` の `AccountRow` で `useBalanceAsOf(account.id, todayString())` を読み、一覧の注記を「（残高 ¥X）」（読み込み中は出さない）にする。編集を始めたときに今日時点の残高を入力欄と「開始時の値」に入れ、ラベルを「現在の残高」、検証を `parseBalance`（エラー「現在の残高は整数で入力してください」）にする。保存時は入力値が開始時の値と異なるときだけ `currentBalance` を渡す。キャンセルで開始時の値に戻す。登録フォームの「初期残高」は変えない
- [x] 3.2 `src/pages/settings.test.tsx` の既存の登録・編集テストを新しい表示（「（残高 ¥120,000）」「現在の残高」）に合わせて直し、次を追加して `npm test -- settings` が通ることを確認する: 前の月の取引がある口座で編集欄に今日時点の残高が入っている／現在の残高を変えて保存するとホームと一覧の残高がその値になる／−500 を入力して保存できる／名前だけ変えると `initialBalance` が変わらない
- [x] 3.3 `docs/design-principles.md` を読み、編集欄と一覧の注記が既存の `inline-form`・`muted` の見た目のままで新しい装飾を足していないことを確認する

## 4. 全体の確認

- [x] 4.1 `npm test`・`npm run lint`・`npm run build`（型チェック含む）がすべて通ることを確認する
- [x] 4.2 開発サーバーで、前の月に取引がある口座の現在の残高を変えて保存し、設定画面の一覧とホームの残高が入力した額になること、名前だけの変更で残高が動かないことを目で確認する
