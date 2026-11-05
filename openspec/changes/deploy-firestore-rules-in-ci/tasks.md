# Tasks

## 1. 原因の確認と今の不具合の解消（手作業）

- [x] 1.1 Firebase コンソールの **Firestore Database → ルール** を開き、反映されているルールの `collection in [...]` に `settings` が無いことを確かめる（あれば原因が違うので、ブラウザの開発者ツールで拒否された書き込みのパスを確かめてから次に進む）
- [x] 1.2 `npx -y firebase-tools@14 deploy --only firestore:rules --project <projectId>` で今の `firestore.rules` を反映し、コンソールのルールに `settings` が入ったことを確かめる
- [x] 1.3 エラーが出ていた端末でアプリを開き直し、サインインし直さずに「権限がありません」が消えて「送れていない変更はありません」になることを確かめる。月の開始日を変えた端末で、別の端末に開始日が届くことも確かめる
- [x] 1.4 サインアウトした端末で Google でサインインし直し、エラーが出ずに同期済みになることを確かめる（PBI-41 の受入条件）

## 2. CI 用のサービスアカウントと Secret（手作業）

- [x] 2.1 GCP コンソールで Firebase プロジェクトにサービスアカウントを作り、**Firebase ルール管理者** と **Service Usage ユーザー** のロールだけを付け、IAM の画面でその 2 つだけが付いていることを確かめる
- [x] 2.2 そのサービスアカウントの鍵（JSON）を作り、GitHub リポジトリの Secret `FIREBASE_SERVICE_ACCOUNT` に登録し、手元の鍵ファイルを削除する。リポジトリの **Settings → Secrets and variables → Actions** に Secret が表示されることを確かめる

## 3. 公開ワークフローでルールを反映する

- [x] 3.1 `.github/workflows/deploy.yml` に `rules` ジョブを足す（`needs: build`、checkout → `google-github-actions/auth@v2` に `secrets.FIREBASE_SERVICE_ACCOUNT` を渡す → `npx -y firebase-tools@14 deploy --only firestore:rules --project ${{ vars.VITE_FIREBASE_PROJECT_ID }} --non-interactive`）。`deploy` ジョブを `needs: [build, rules]` にする。`npx --yes actionlint` などで YAML の構文エラーが無いことを確かめる
- [x] 3.2 README の Firebase の手順（5 番の「ルールを反映する」と、`settings` の注意書き）を書き換える。CI が dev への push のたびにルールを反映すること、2 のサービスアカウントと Secret の作り方と必要なロール、初回の手での反映は今の手順のまま使えること、ルールで書き込める範囲を狭めるときは先にアプリを公開すること、を書く。「CI はルールを反映しない」の記述が残っていないことを確かめる
- [ ] 3.3 ブランチを dev に入れる前に、Actions の workflow_dispatch でワークフローを動かし、`rules` ジョブのログに `firestore: released rules firestore.rules to cloud.firestore` が出て、その後に `deploy` が成功することを確かめる

## 4. 全体の確認

- [ ] 4.1 試しに Secret の名前を一時的に変えて workflow_dispatch を動かし、`rules` ジョブが失敗して `deploy` が動かないこと（公開中のアプリが前のバージョンのまま）を確かめてから、Secret を元に戻す
- [ ] 4.2 公開された URL でアプリを開き、Google でサインインして、エラーが出ずに同期済みになることを確かめる
