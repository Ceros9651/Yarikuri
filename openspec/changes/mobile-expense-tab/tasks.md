# Tasks

## 1. 準備と画面幅の判定

- [ ] 1.1 ブランチ `PBI-36` に `origin/dev` を取り込み（`git fetch` のうえで merge）、`src/pages/TransactionsPage.tsx` にカレンダー（`TransactionCalendar`）があり `openspec/specs/transactions/spec.md` に「PC 版の取引一覧のカレンダー」があることを確認する。`npm test` が取り込み直後の状態で通ることを確認する
- [ ] 1.2 `src/hooks/useIsDesktop.ts` に、`useSyncExternalStore` で `matchMedia('(min-width: 1024px)')` を購読し、`matchMedia` がない環境では `true` を返すフックを作る（`index.css` のブレークポイントとそろえる旨を注記）。`src/test/` に `window.matchMedia` を差し替えるヘルパー（`mockViewport('mobile' | 'desktop')`、`change` の発火で幅の変更も再現でき、後片付けで元に戻す）を加え、フックのテストで「既定は PC」「mobile では false」「幅の変更で再描画される」を確かめ、`npm test -- useIsDesktop` が通ることを確認する

## 2. カテゴリ別の出費の部品

- [ ] 2.1 `UNCATEGORIZED` を `src/domain/summary.ts` へ移し、`HomePage.tsx` / `TransactionsPage.tsx` の import を差し替える。`src/components/CategoryBreakdown.tsx` に、ホームの「カテゴリ別の出費」（見出し・行のリンク・割合のバー・空のときの文言）を切り出し、見出しの行に出費の合計を出すかどうかを指定できるようにする。ホームを部品で置き換えても `npm test -- home` がそのまま通ることを確認する

## 3. スマホ版のホーム

- [ ] 3.1 `HomePage.tsx` で `useIsDesktop` を使い、スマホ版ではカテゴリ別の出費を描かず、右列を「カード別の利用額」「残高」「予算」の順に描く（PC 版は今のまま）。`src/pages/home.test.tsx` に spec の「セクションが優先度の順に並ぶ」「予算超過のアラートは月の収支より上に残る」「スマホ版の読み上げの順番」「スマホ版では出費タブに表示する（ホームに出ない側）」「画面幅を変えると並びが切り替わる」をスマホ版のテストとして足し、既存の PC 版の並び・読み上げのテストも通ることを `npm test -- home` で確認する

## 4. スマホ版の出費タブ

- [ ] 4.1 `TransactionsPage.tsx` に、スマホ版でカテゴリ・支払元・日付の絞り込みも `view=list` もないときの表示（読み上げ用の h1「出費」、月の切り替え、見出しの行に月の出費の合計を出した `CategoryBreakdown`、その下に `/transactions?view=list` への「すべての取引」）を加える。`src/pages/transactions.test.tsx` に spec の「出費タブでカテゴリ別の出費を見る」「出費のない月」「月を切り替える」「スマホの出費タブからカテゴリの取引を開く」「PC では従来どおり一覧を表示する」「画面幅を変えると表示が切り替わる」を足し、`npm test -- transactions` が通ることを確認する
- [ ] 4.2 スマホ版の `setFilter` が `view=list` を付けたままにするようにし、「すべての取引を開く」（戻るでカテゴリ別の出費に戻る）「絞り込みをすべて外しても一覧のまま」「編集後は絞り込んだ一覧に戻る（`view=list` を含む）」をスマホ版のテストとして足す。PC 版では URL に `view` が付かないことも確かめ、`npm test -- transactions` が通ることを確認する

## 5. タブの名前

- [ ] 5.1 `Layout.tsx` の取引一覧のタブに、スマホ版の名前「出費」を持たせ、`useIsDesktop` が false のときに表示する。`src/components/Layout.test.tsx` に「スマホ版ではリンクが ホーム／出費／入力／設定」「出費タブで一覧を開いても出費タブが選択中」「出費タブを押すと絞り込みが外れてカテゴリ別の出費に戻る」「幅を変えるとサイドバーでは取引一覧、タブバーでは出費になる」を足し、既存の PC 版のテストも通ることを `npm test -- Layout` で確認する

## 6. 見た目とデザイン方針

- [ ] 6.1 `docs/design-principles.md` に、スマホ版のホームの並び（収支・カード・残高・予算、カテゴリ別の出費は置かない）と、スマホ版の「出費」タブ（カテゴリ別の出費を箱で囲まず、合計は見出しの行、全取引への導線は内訳の直下）のルールを由来 `mobile-expense-tab` 付きで追記し、既存のルールと矛盾しないことを読み合わせて確認する
- [ ] 6.2 サンプルデータ（`.claude/skills/ui-review/fixtures/seed-sample-data.js`）を入れ、Playwright の 390×844 と 360×800 でホーム（収支・カード・残高・予算の順、カテゴリ別の出費がない）と出費タブ（カテゴリ別の出費・合計・「すべての取引」、バーが無彩色、箱で囲まれていない）をスクショで確認する。カテゴリの行と「すべての取引」から一覧を開き、戻るで出費タブに戻ることも確認する。1280×800 でホーム・取引一覧・サイドバーの見た目が変更前と同じこと、ウィンドウを 1024px 未満に狭めるとその場で切り替わることも確認する。新しく加えた要素がアンチパターン（`.claude/skills/ui-review/anti-patterns.md`）に当たらないことを確認する

## 7. 確認

- [ ] 7.1 `npm run lint` と `npm test` が通ることを確認し、`openspec validate mobile-expense-tab` が通ることを確認する
- [ ] 7.2 （ユーザーが実行）スマホの実機で、出費タブからカテゴリ別の出費を見て、カテゴリの取引を編集し、元の一覧に戻れることを確認する。実装担当はこのタスクにチェックを付けない
