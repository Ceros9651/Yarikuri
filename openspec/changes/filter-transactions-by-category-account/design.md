# Design

## Context

- 取引一覧（`src/pages/TransactionsPage.tsx`）は `useSearchParams` で `category` を読み、`matchesCategory` で出費を絞り込んでいる。未分類は `UNCATEGORIZED = 'none'`。絞り込み中は `.filter-bar`（「〇〇の出費」と `button.link` の「絞り込みを解除」）を出している。この画面の中で条件を選ぶ UI はない。
- ホーム（`HomePage.tsx`）のカテゴリ行は `/transactions?category=<id|none>` へのリンク。編集画面は `location.state.returnTo`（`/transactions` で始まる値）へ戻る。下部タブはクエリなしの `/transactions` を開く。この3つはクエリをまるごと受け渡すので、`account` を足しても変更は要らない。
- 月は `MonthContext` が持ち、URL には載っていない。
- 入力画面のチップは `.chips`（`role="group"` + `aria-label`、各 `button` に `aria-pressed`）。カテゴリ・口座は `useAllData()` で `sortOrder` 順に取れる。口座を削除する機能はなく、非表示にできるだけ。
- UI は `docs/design-principles.md` に従う（カードで囲まない、飾りアイコンを使わない、色は状態にだけ使う）。

## Goals / Non-Goals

**Goals:**
- 条件はすべて URL のクエリで表し、ホームのリンク・編集後の戻り先・タブからの解除・ブラウザの戻るを今の仕組みのまま使えるようにする。
- チップは入力画面と同じ `.chips` の見た目と操作にする。

**Non-Goals:**
- 収入カテゴリ、入金先・振替・残高調整の口座での絞り込み（出費だけを対象にする。spec のとおり）。
- 複数のカテゴリ・口座を同時に選ぶこと（各条件は1つだけ選べる）。
- 種類・金額・メモ・期間での絞り込みや、絞り込んだ結果の合計の表示。
- 選択肢の一覧の開閉。PBI の確認で「チップを常時表示」と決めたので入れない。

## Decisions

### 1. 支払元は `?account=<口座ID>` で表し、条件は AND で組み合わせる
`matchesCategory` と同じ形の `matchesAccount(tx, account)`（`account === null` なら通す。そうでなければ `type === 'expense' && tx.accountId === account`）を足し、`filter` で両方を満たす取引だけにする。どちらかの条件があれば出費以外は外れるので、spec の「収入・振替・残高調整を表示しない」はこれで満たせる。
- 代替案: `?filter=category:x,account:y` のように1つのキーにまとめる。ホームのリンク `?category=` を変える必要が出るので採らない。

### 2. チップを押したときは、もう一方のクエリを残して `replace` で更新する
`setSearchParams((prev) => { const next = new URLSearchParams(prev); value ? next.set(key, value) : next.delete(key); return next; }, { replace: true })`。「すべて」は `delete` にあたる。`replace` にするのは、チップを押すたびに履歴が増えて、戻る操作でホームへ戻れなくなるのを避けるため（今の解除ボタンと同じ考え方）。
- 代替案: `push` で履歴に積む。条件を何度も切り替えると戻る操作が効かなくなったように見えるので採らない。

### 3. 選択肢の作り方
- カテゴリ: `kind === 'expense' && (!hidden || id === category)` を `sortOrder` 順に並べる。選択中の月に `type === 'expense' && !categoryId` の取引があるか、`category === 'none'` のときは、末尾に「未分類」（値 `none`）を足す。
- 支払元: `!hidden || id === account` の口座を `sortOrder` 順に並べる。種別では絞らない（出費の支払元には全種別を選べるため）。
- 先頭の「すべて」は、その条件のクエリがないときに `aria-pressed="true"` にする。クエリの値が選択肢にない ID（存在しないカテゴリなど）のときは、どのチップも選択状態にせず、一覧は0件になる。URL を手で書き換えたときだけ起こるので、特別な表示はしない。
- 未分類のカテゴリ名を「未分類」にする今の扱いは変えない。

### 4. 見た目と配置
`MonthSwitcher` と一覧の `section` の間に、入力画面の `.field` と同じく小さな見出し（「カテゴリ」「支払元」）と `.chips` を2組、縦に並べる。各組は `role="group"`、`aria-label` は見出しと同じにする（入力画面のテストと同じ書き方で取れる）。カードで囲まず、アイコンも付けない。一覧とのあいだは余白で区切る。
`.filter-bar` の行と「絞り込みを解除」ボタンは消す。条件はチップの選択状態で分かり、解除は「すべて」で足りるので、同じ情報を2か所に出さない。使わなくなる `.filter-bar` のスタイルも消す。
- 代替案: チップに加えて「絞り込みを解除」を残す（両方を一度に外せる）。2つの条件を外すのも2タップで済み、表示が重複するので採らない。

### 5. 空の表示
絞り込み中に0件のときは「条件に合う出費はありません」、絞り込みのないときは今の「この月の取引はありません」を出す。チップの一覧は件数にかかわらず出す。

## Risks / Trade-offs

- [カテゴリと口座が多いと、チップだけで画面の上半分を占め、一覧が下に押される] → PBI の確認でチップの常時表示を選んだ。カテゴリは初期で十数個、口座は数個の想定。実機の幅（390px・360px）で確認し、目立って押し下げるようなら `/ui-review` で見直す。
- [「すべて」を選ぶと出費以外も戻ってくるため、カテゴリだけ外したつもりで収入が出てくると思う人がいる] → 支払元が残っていれば出費だけのままなので、両方を外したときだけ全取引に戻る。spec のシナリオで固定する。
- [既存テストが「絞り込みを解除」ボタンを使っている] → タスクでチップの「すべて」を押すテストに置き換える。

## Migration Plan

データの移行はない。`?category=` の URL はそのまま使える。戻すときはこの変更のコミットを revert する。
