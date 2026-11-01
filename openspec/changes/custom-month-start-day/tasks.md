# Tasks

## 1. 月の期間の算出

- [x] 1.1 `src/domain/date.ts` に `periodRange(month, startDay)`（`{ start, end }`）、`periodOf(date, startDay)`（文字列と `Date` を受け取る）、`isInPeriod(date, range)`、`formatPeriodLabel(range)`（「10月6日〜11月5日」）を加える。`src/domain/date.test.ts` を新しく作り、「開始日 1日は暦月（2026-02 は 02-01〜02-28）」「開始日 6日の 2026-10 は 10-06〜11-05」「2026-12 は 2027-01-05 まで」「11-03 は 2026-10、11-06 は 2026-11」「開始日 28日の 2027-01 は 01-28〜02-27」「期間のラベル」を確かめ、`npm test -- date` が通ることを確認する

## 2. 集計と予算を期間で判定する

- [x] 2.1 `summarizeMonth` を範囲を受け取る形にし、`startsWith` の判定を `isInPeriod` に置き換える。`src/domain/summary.test.ts` の既存のテストを範囲を渡す形に直し、spec の「開始日が 6日のときの月の範囲」（10/5・10/6・11/5・11/6 のうち 10/6 と 11/5 だけが入る）を足して `npm test -- summary` が通ることを確認する
- [x] 2.2 `summarizeBudgets` と `budgetAlertFor` が範囲（アラートは開始日から取引の属する月と範囲）を使うようにする。`src/domain/budget.test.ts` に spec の「開始日が 6日のときの消化状況」と「開始日より前の日付は前の月で判定する」を足し、既存のテストとあわせて `npm test -- budget` が通ることを確認する
- [x] 2.3 `src/domain/balance.ts` の `balancesAtMonthEnd` を、期間の取引と最終日を受け取り口座ごとに `balanceAsOf` を呼ぶ `balancesAsOf` に置き換える（design の決定 3）。`src/domain/balance.test.ts` の月末残高のテストを直し、spec の「開始日が 6日のときは期間の最終日時点の残高」（11/5 を含み 11/6 を含まない）を足して `npm test -- balance` が通ることを確認する
- [x] 2.4 `src/domain/calendar.ts` の `calendarWeeks` を範囲を受け取る形にし、日の枠のラベル（範囲が暦月をまたぐときの最初の日と後の月の 1日だけ `M/D`）を返す関数を加える。`src/domain/calendar.test.ts` の既存の 2026-10 と 2026-02 のテストを開始日 1日の範囲で通し、「開始日 6日の 2026-10 は 1 行目の日・月が空で火曜が 10-06、11-01 の次から 11-05 の木曜で終わり、金・土が空」「ラベルは 10/6・11/1 だけ月付き」を足して `npm test -- calendar` が通ることを確認する

## 3. 設定の保存・同期・バックアップ

- [x] 3.1 `src/domain/types.ts` に `AppSettings`、`src/db/db.ts` に version 5 の `settings: 'id'` を加え、`src/db/repository.ts` に `setMonthStartDay(day)`（1〜28 の整数以外は `ValidationError`、`put` と `markDirty('settings')` を同じトランザクションで行う）と、記録がなければ 1 を返す読み込みを加える。`src/db/db.test.ts` に「version 4 のデータベースを開き直すと settings が空で既存データが残る」、`src/db/repository.test.ts` に「6 を保存すると読み込みが 6 になり outbox に積まれる」「0・29・1.5 は保存しない」を足して `npm test -- db repository` が通ることを確認する
- [x] 3.2 `src/sync/docs.ts` の `SYNC_TABLES` と `SyncRecords` に `settings` を加え、`src/sync/remote.ts` に `settingsSchema`（`id` は `'app'`、`monthStartDay` は 1〜28 の整数）を足し、`firestore.rules` の許可するコレクションに `'settings'` を加える。`src/sync/engine.test.ts` に spec の「月の開始日も同期される」（片方で 6 日にすると、もう片方の端末の設定が 6 になる）と「新しい端末に月の開始日が引き継がれる」、`src/sync/remote.test.ts` に「範囲外の開始日の記録は取り込まない」を足して `npm test -- sync` が通ることを確認する
- [x] 3.3 `src/domain/backup.ts` を version 3 にし、`BackupData` に `settings: { monthStartDay }` を加え、version 1・2 は 1日として読み込み、version 3 で `settings` がない・範囲外なら形式エラーにする。`src/db/backup.ts` の `exportData`・`importData` を `settings` の表に対応させる。`src/domain/backup.test.ts` に「version 2 のファイルは 1日になる」「version 3 で開始日が 29 なら拒否する」、`src/pages/backup.test.tsx` に spec の「月の開始日を含まない旧形式のファイルを読み込む」と「別の端末へ移行する」の開始日の往復を足して `npm test -- backup` が通ることを確認する
- [x] 3.4 README の Firestore のルールの手順に、このバージョンからルールに `settings` が加わるので公開前に反映し直すことを追記し、手順の文面が `firestore.rules` の内容と合っていることを読み合わせて確認する

## 4. 画面を期間に対応させる

- [x] 4.1 `src/db/queries.ts` に `readPeriodTransactions(db, range)` を加え、`src/hooks/useData.ts` に `useMonthStartDay()` を加え、`useMonthData` が開始日から範囲を求めて期間の取引を読み `range` を返すようにする。`src/db/repository.ts` の `getBudgetAlert` は同じトランザクションで設定を読み、取引の属する期間の取引を読む。`src/pages/home.test.tsx` に「開始日 6日で 10月の差額・カテゴリ別の出費・カード別の利用額が 10/6〜11/5 の取引だけで出る」、`src/pages/transactions.test.tsx` に spec の「開始日が 6日のときの一覧」、予算のアラートのページテストに「11/3 の出費で 10月の予算超過が出る」を足して `npm test -- home transactions` が通ることを確認する
- [x] 4.2 `src/components/MonthContext.tsx` を design の決定 5 のとおり `selected`（null は今月）と開始日から `month`・`range` を返す形にし、開始日を読み終えるまで子を描画しない。`src/pages/home.test.tsx` に spec の「開始日より前の日は前の月になる」（今日 11/3・開始日 6日で 2026年10月が出る）と「開始日を 6日にする」（月を選んでいなければ今月が新しい開始日で求め直される）を足して `npm test -- home` が通ることを確認する
- [x] 4.3 `src/components/MonthSwitcher.tsx` で、開始日が 1日以外のとき月名と同じ見出しの中に `formatPeriodLabel(range)` を小さく控えめな色で出す（`src/index.css` に期間用のクラスを足し、スマホの中央寄せと PC の左寄せのどちらでも月名の下か横に収める）。`src/pages/home.test.tsx` に spec の「期間が月名と並んで表示される」「年をまたぐ月」「開始日が 1日なら期間を出さない」を足して `npm test -- home` が通ることを確認する
- [x] 4.4 `src/pages/TransactionsPage.tsx` のカレンダーを範囲の `calendarWeeks` と日の枠のラベルで描き、日付の絞り込みの判定（`dateParam` が月に含まれるか、月の切り替え時の消去）を `isInPeriod` に置き換える。`src/components/CategoryExpenses.tsx` の月の判定も範囲に合わせる。`src/pages/transactions.test.tsx` に spec の「開始日から翌月の前日までを並べる」「開始日を変えるとカレンダーの範囲が変わる」と「開始日 6日で 11/3 の枠を押すと 11/3 で絞り込める」を足し、`npm test -- transactions expenseTab` が通ることを確認する

## 5. 設定画面のセクション

- [x] 5.1 `src/components/settings/MonthStartSection.tsx` を作り、見出し「月の開始日」、1日〜28日の `<select>`（ラベル「月の開始日」）、その下に「今月は 10月6日〜11月5日」の 1 行を出す。選んだら直ちに `setMonthStartDay` で保存する。`src/pages/SettingsPage.tsx` のカテゴリと予算のあいだに置き、設定画面の他のセクションと同じ `section.card` の見出し＋説明＋本文の並びにする（`docs/design-principles.md` に従う）。`src/pages/settings.test.tsx` に spec の「開始日を 6日にする」「既定では暦月のまま」「29日以降は選べない」を足して `npm test -- settings` が通ることを確認する
- [x] 5.2 サンプルデータ（`.claude/skills/ui-review/fixtures/seed-sample-data.js`）を入れて開始日を 6日にし、Playwright で 390×844 と 1280×800 のホーム・取引一覧・設定画面のスクショを撮り、月の切り替えの期間が月名より控えめに出て前後のボタンの位置が変わらないこと、PC のカレンダーが 10/6 から 11/5 まで並び 10/6・11/1 に月が付くこと、ダークモードでも期間の文字が読めることを確認する
- [x] 5.3 `docs/design-principles.md` に「月の開始日が 1日以外のとき、月の切り替えは月名の後に期間を小さく控えめな色で添え、ボタンの位置は変えない」と「カレンダーが暦月をまたぐときは、範囲の最初の日と後の月の 1日だけ M/D で示す」を由来 `custom-month-start-day` 付きで追記し、既存のルールと矛盾がないことを読み合わせて確認する

## 6. 確認

- [x] 6.1 `npm run lint` と `npm test` が通ることを確認する
- [x] 6.2 開始日 1日のまま操作して、ホーム・出費タブ・取引一覧・カレンダー・予算の表示が変更前と同じであること、開始日を 6日 → 1日に戻すと元の表示に戻ることを実画面で確認する
- [ ] 6.3 （ユーザーが実行）Firestore のルールを反映してから 2 台でサインインし、片方で開始日を変えるともう片方のホームと取引一覧の範囲が変わることを確認する。実装担当はこのタスクにチェックを付けない
