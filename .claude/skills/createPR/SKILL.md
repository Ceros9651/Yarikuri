---
name: createPR
description: 現在のブランチの直近の変更からGitHubのプルリクエストを作成する。未コミットの変更があればコミットし、pushしてから gh pr create でPRを作る。「PR作って」「プルリク作成」「プルリクエスト出して」と言われたとき、または/createPRで呼ばれたときに使う。引数でベースブランチやPRの補足を渡せる。
argument-hint: "[ベースブランチ] [補足]"
allowed-tools: Bash(git:*), Bash(gh:*)
---

# createPR: 直近の変更からプルリクエストを作成

引数: $ARGUMENTS

## 1. 状況把握（並列で実行）

- `git status`
- `git branch --show-current`
- `git remote -v`
- `gh pr view --json url,state 2>/dev/null`（既存PRの有無）

ベースブランチは引数で指定があればそれ、なければ **`dev`**。

## 2. 事前チェック

- **現在のブランチがベースブランチ（`dev` / `main`）の場合**: 変更内容から `feat/xxx` や `fix/xxx` のような名前を決めて新しいブランチを切る。
- **既に open なPRがある場合**: 新規作成せず、pushだけして既存PRのURLを伝える。本文の更新が必要か確認する。
- **未コミットの変更がある場合**: 差分を確認してコミットする。
  - メッセージは既存規約に合わせ、`feat:` / `fix:` / `docs:` / `refactor:` / `chore:` などのプレフィックス + **日本語** の要約。
  - `.env` や認証情報らしきファイルはステージしない。見つけたらユーザーに確認する。
  - `git add -A` ではなく、関係するファイルを明示して追加する。

## 3. 変更内容の収集（並列で実行）

- `git log --oneline <base>..HEAD`
- `git diff <base>...HEAD --stat`
- `git diff <base>...HEAD`（大きすぎる場合は `--stat` と主要ファイルだけ読む）

`openspec/changes/` や `openspec/specs/` に関連する変更があれば、その proposal / design を読んで背景をPR本文に反映する。

コミットが1件もない（ベースと差分なし）場合は、PRを作らずにその旨を伝えて終了する。

## 4. push

- upstream未設定なら `git push -u origin <branch>`、設定済みなら `git push`。
- force push はしない。rejectされたら原因をユーザーに伝えて止まる。

## 5. PR作成

`gh pr create --base <base> --title "<タイトル>" --body-file <一時ファイル>` で作成する（本文はスクラッチパッドに書き出してから渡す。PowerShellのクォート問題を避けるため）。

- **タイトル**: コミット規約と同じ形式（例: `feat: 予算設定、アラート機能を追加`）。70文字以内。複数コミットなら全体を要約する。
- **本文**（日本語）:

```markdown
## 概要
<!-- 何を・なぜ変更したか 1〜3行 -->

## 変更内容
- <!-- 主要な変更を箇条書き -->

## 確認方法
- [ ] <!-- 動作確認の手順 -->

## 補足
<!-- 引数で渡された補足、関連するOpenSpec change、注意点など。なければ省略 -->
```

- 本文末尾には、システムから指示されている帰属表記（attribution）があればそれを付ける。

## 6. 結果報告

作成したPRのURLと、タイトル・ベースブランチ・含まれるコミット数を簡潔に伝える。
