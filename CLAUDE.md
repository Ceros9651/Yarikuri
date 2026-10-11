# CLAUDE.md

## UIデザイン

フロントエンドの画面やコンポーネントを作成・変更するときは、必ず `docs/design-principles.md` を読んで従うこと。
角丸カードの多用、飾りアイコンや絵文字、グラデーションや強い影、均一な余白と中央寄せは避ける（詳細は `.claude/skills/ui-review/anti-patterns.md`）。

既存画面の見た目を見直すときは `/ui-review <画面名>` を使う。レビュー中はアプリのコードを編集せず、採用した方針は OpenSpec の change として起票してから通常のフローで実装する。
