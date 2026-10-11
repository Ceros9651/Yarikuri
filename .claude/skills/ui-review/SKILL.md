---
name: ui-review
description: 指定した画面のフロントエンドから「AIが作ったっぽさ」（角丸カードの多用、飾りアイコン、グラデ・影、均一な余白と中央寄せ）を見つけ、実在アプリを参考にした修正方針を選択式で相談し、OpenSpec の change として起票する。/ui-review <画面名> または /ui-review --verify <change名> で明示的に呼ばれたときだけ使う。
argument-hint: <画面名> | --verify <change名>
disable-model-invocation: true
---

# /ui-review

引数: `$ARGUMENTS`

分析は `ui-reviewer` サブエージェントに任せ、ユーザーとの相談・ファイル作成はこのメインの会話で行う。サブエージェントはユーザーに質問できないため、**選択肢の提示は必ずここで AskUserQuestion を使う**。

## 画面一覧

dev サーバーのベースURLは `http://localhost:5173/Yarikuri/`（`vite.config.ts` の `base`）。ルーターは HashRouter なので、画面のパスは `#/` の後ろに付く。定義は `src/App.tsx`。

| 画面名（引数で受け付ける名前） | URL                                                         | 主なファイル                                                  | spec の capability                                   | change 名                    |
| ------------------------------ | ----------------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------- | ---------------------------- |
| ホーム / home                  | `http://localhost:5173/Yarikuri/#/`                         | `src/pages/HomePage.tsx`, `src/components/MonthSwitcher.tsx`  | `monthly-summary`（予算表示は `budgets`）            | `ui-refine-home`             |
| 取引一覧 / transactions        | `http://localhost:5173/Yarikuri/#/transactions`             | `src/pages/TransactionsPage.tsx`                              | `transactions`                                       | `ui-refine-transactions`     |
| 取引の編集 / edit-transaction  | `http://localhost:5173/Yarikuri/#/transactions/sample-tx-01` | `src/pages/EditTransactionPage.tsx`, `src/components/TransactionForm.tsx` | `transactions`                                       | `ui-refine-edit-transaction` |
| 入力 / new                     | `http://localhost:5173/Yarikuri/#/new`                      | `src/pages/NewTransactionPage.tsx`, `src/components/TransactionForm.tsx` | `transactions`                                       | `ui-refine-new`              |
| 設定 / settings                | `http://localhost:5173/Yarikuri/#/settings`                 | `src/pages/SettingsPage.tsx`, `src/components/settings/*`     | `accounts` / `categories` / `budgets` / `data-backup` | `ui-refine-settings`         |
| タブバー / layout              | `http://localhost:5173/Yarikuri/#/`（全画面共通）           | `src/components/Layout.tsx`                                   | `pwa-app`                                            | `ui-refine-layout`           |

- 上の表にない名前が来たら、`src/App.tsx` を読み直して近い画面を探す。決められなければ表の画面を AskUserQuestion で選ばせる。
- `sample-tx-01` は `fixtures/seed-sample-data.js` が入れる固定 ID。編集画面はサンプルデータ投入後でないと開けない。
- ポートが 5173 でない場合（下記「準備」で別ポートになった場合）は URL のポートを読み替える。

## 0. 準備（毎回）

1. 引数を解釈する。
   - `--verify <change名>` → 「検証フロー」へ。
   - それ以外 → 引数を画面名として「レビューフロー」へ。引数が空なら、上の画面一覧を AskUserQuestion で出して1つ選ばせる（4択を超えるので、ホーム／取引一覧／入力／設定を選択肢にし、編集画面とタブバーは「その他」で受ける）。
2. 画面名から上の表で URL を決める。
3. dev サーバーが起動しているか確認する: `curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/Yarikuri/` が `200` なら起動済み。
   - 起動していなければ `npm run dev` を Bash の `run_in_background` で起動し、出力に `Local:` の行が出るまで待つ。5173 が埋まっていると Vite は別ポートを使うので、出力の URL からポートを読み取る。
   - 自分で起動したサーバーは、フローの最後に止める。
4. Playwright MCP（`mcp__playwright__*`）が使えるか確認する。使えなければ、リポジトリ直下の `.mcp.json` の `playwright` サーバーを有効化して Claude Code を再起動するよう伝えて止める。
5. `.claude/skills/ui-review/references.md` に参考アプリが1件も無ければ「参考リスト初期化」を先に行う。
6. `docs/design-principles.md` が無ければ、`.claude/skills/ui-review/templates/design-principles.md` をコピーして作る。
7. `.ui-review-tmp/` に前回の残りがあれば削除しておく。

## 参考リスト初期化（初回のみ）

1. `ui-reviewer` を `mode: seed-references` で呼ぶ。
2. 返ってきた候補を AskUserQuestion（`multiSelect: true`、1問4択まで。候補が5件以上なら複数問に分ける）で提示し、気に入ったものを選ばせる。各選択肢の description に「参考になる点」を入れる。
3. 選ばれたものだけを references.md の書式で追記する（追加日は今日の日付）。1件も選ばれなければ、references.md は空のまま、レビューでは Web 検索の参考だけを使う。

## レビューフロー

1. `ui-reviewer` を `mode: review`、`screen: <画面名> (<URL>)` で呼ぶ。
2. 返ってきた指摘（最大5件）を、1指摘＝1問として AskUserQuestion で提示する（4問を超えたら2回に分ける）。
   - `header`: 指摘の短縮名（12文字以内）
   - `question`: 「<見えている問題>。どう直しますか？」＋該当箇所を1文
   - `options`: 案A（推奨、ラベル末尾に「（推奨）」）、案B、案C、最後に「そのままにする」。description に参考アプリと影響範囲を1行で。`preview` に案のプレビューを入れる。
   - 共通クラス（`src/index.css` の `.card` / `.list` / `button` など）や `:root` のトークンに波及する案は、description の先頭に「【他画面にも影響】」と付ける。
3. 「その他」で自由記述された回答は、意図を自分の言葉で言い直して確認する。曖昧なら追加で1問だけ聞く。
4. 「その他の気になる点」がある場合、最後に「次回のレビューに回す／今回もう一度詳しく見る」を1問で聞く。「もう一度詳しく見る」なら、その点に絞って `ui-reviewer` を再度呼び、同じ形で相談する（合計で5件を超えないようにする）。
5. 採用された指摘が0件なら、`.ui-review-tmp/` を空にして終了する。
6. 1件以上あれば「起票」へ。

## 起票（1回のレビュー＝1 change）

このリポジトリの OpenSpec（CLI 1.13 系、schema `spec-driven`）では **spec 差分が無い change は `validate --strict` で落ちる**。既存の change（例: `openspec/changes/archive/2026-10-11-fix-date-field-overflow/`）と同じく、見た目の要件を capability に ADDED で足す。

1. change 名は画面一覧の `ui-refine-<画面>`。`openspec/changes/` に同名が既にあれば末尾に `-2`, `-3` を付ける。
2. `openspec new change <change名>` で作る（`.openspec.yaml` が作られる）。
3. 次を作成する。文体は既存 change に合わせ、日本語で、利用者から見た言葉で書く。

   **`proposal.md`**

   ```markdown
   # Proposal

   ## Why

   <検出されたAIっぽさと、それが利用者にとって何の問題か（読む順番が分からない、押せる所が分からない等）>

   ## What Changes

   - <採用した案ごとに1項目。参考アプリ名と、何を参考にしたかを明記>
   - データや操作（保存される値、画面遷移）は変えない。

   ## Capabilities

   ### New Capabilities

   （なし）

   ### Modified Capabilities

   - `<capability>`: <足す見た目の要件の要約>

   ## Impact

   - `src/index.css`: <変えるクラス・トークン>
   - `src/...tsx`: <変えるコンポーネント>
   - 影響する他画面: <共通クラス・トークンを変える場合に列挙。無ければ「なし（この画面だけ）」>
   - 検証: jsdom ではレイアウトを計算しないため、`/ui-review --verify <change名>` の Before/After スクショと実機で確認する。
   - 参考スクショ: `screenshots/before-*.png`
   ```

   **`specs/<capability>/spec.md`**（採用した案が複数の capability にまたがるなら capability ごとに作る）

   ```markdown
   # Spec Delta

   ## ADDED Requirements

   ### Requirement: <要件名>
   <ui-reviewer の「spec 要件案」を元に、〜しなければならない（SHALL）で1〜2文>

   #### Scenario: <シナリオ名>
   - **WHEN** ユーザーがスマホで<画面>を開く
   - **THEN** <見て確認できる結果>
   ```

   - 要件名は `openspec/specs/<capability>/spec.md` の既存要件と重複しないようにする。既存要件の書き換えが必要なら `## MODIFIED Requirements` を使い、既存の要件全文をコピーしてから直す。

   **`tasks.md`**

   ```markdown
   # Tasks

   ## 1. <採用した案1>

   - [ ] 1.1 <具体的な変更。対象のファイルとクラス名まで書く>。`npm run dev` を開き、開発者ツールのスマホ表示（幅 390px・360px）で <確認すること> を確認する

   ## 2. <採用した案2>

   ...

   ## N. 確認

   - [ ] N.1 `npm run lint` と `npm test` が通ることを確認する
   - [ ] N.2 （ユーザーが実行）`/ui-review --verify <change名>` で Before/After を確認する。実装担当はこのタスクにチェックを付けない
   ```

   **`screenshots/`**: `.ui-review-tmp/` の `before-*.png` をここへ移動する（`mkdir -p` してから `mv`）。

   - design.md は、共通クラスや `:root` のトークンを変えて他画面に影響する場合だけ作り、影響する画面ごとの見た目の変化と、採らなかった案とその理由を書く。

4. `openspec validate <change名> --strict` を実行し、通るまで直す。
5. `docs/design-principles.md` の該当する節に、採用した案の「方針ルール」を `- <ルール>（<change名>）` の形で追記する。既存ルールと重複・矛盾する場合は追記せず、AskUserQuestion で「既存ルールを更新する／今回は例外とする」を聞く。例外にするなら「例外」の節に書く。
6. `.ui-review-tmp/` を空にする（ディレクトリごと削除してよい）。自分で起動した dev サーバーがあれば止める。
7. 最後に、change のパスと「実装後に `/ui-review --verify <change名>` を実行する」ことだけを短く伝える。実装はしない。

## 検証フロー（--verify）

1. `openspec/changes/<change名>/` が存在し、`screenshots/before-*.png` があることを確認する。無ければ理由を伝えて止める。
2. change 名と proposal.md から対象画面を特定し、画面一覧で URL を決める。準備の3〜4・7を行う。
3. `ui-reviewer` を `mode: verify`、`screen: <画面名> (<URL>)`、`change: <change名>` で呼ぶ。
4. after 画像を `.ui-review-tmp/` から change の `screenshots/` へ移動し、`.ui-review-tmp/` を空にする。
5. 結果を伝える:
   - すべてOKで新たな問題も副作用もなければ、tasks.md の検証タスクにチェックを付け、完了を伝える（アーカイブは通常の OpenSpec フローで行う）。
   - 要修正・新たなAIっぽさ・副作用があれば、1件＝1問で AskUserQuestion にかけ（「このchangeで直す（推奨）」「次のレビューに回す」「問題ない」）、「このchangeで直す」を選んだものを tasks.md の検証タスクの直前に追記する。検証タスクはチェックしないまま残す。
6. 自分で起動した dev サーバーがあれば止める。

## やらないこと

- このスキルの中でアプリのコード（`src/` など）を編集しない。実装は OpenSpec の通常フロー（`/opsx:apply`）で行う。
- 指定されていない画面をレビューしない（共通クラスの影響確認のための撮影は除く）。
- 指摘を5件より多く相談しない。
