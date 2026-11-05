# Design

## Context

- `.github/workflows/deploy.yml` は dev への push で `build`（lint・テスト・ビルド）→ `deploy`（GitHub Pages）の 2 ジョブを動かす。Firebase の Web 設定は Variables（`VITE_FIREBASE_*`）に置いている
- `firestore.rules` と `firebase.json`（`firestore.rules` を指す）はリポジトリにあるが、Firebase への反映は README の手順で手作業。`.firebaserc` はなく、反映先は `--project` で渡している
- アプリの書き込み先は `users/{uid}`（`initializedAt` のみ）と `users/{uid}/{accounts|categories|transactions|budgets|settings}/{docId}`。ルールで拒否されると Firestore は `permission-denied` を返し、`src/sync/firebase.ts` の `toSyncError` で `kind: 'permission-denied'` になり、設定画面に PBI-41 の文言が出る
- 送れなかった記録は outbox に残る。`SyncEngine.start()` は outbox の件数を `liveQuery` で見ていて、開始時に1件以上あれば送り直す。アプリを開き直せば、ルールが直ったあとに自動で再送される（コードの変更はいらない）
- 原因の確認: Firebase コンソールの **Firestore Database → ルール** に `settings` が入っているかで確かめられる。リポジトリからは見えないため、tasks の最初に確認を置く

## Goals / Non-Goals

**Goals:**
- 公開ワークフローが、アプリと同じコミットの `firestore.rules` を必ず反映する
- ルールの反映に失敗したら、アプリを公開しない
- CI の認証情報は、ルールの反映に必要な権限だけにする

**Non-Goals:**
- エラー文言やサインインの流れの変更（ルールが合っていれば出ないエラーのため）
- Firestore のエミュレータを使ったルールのテストの追加
- PR の段階でルールを検証すること（公開ワークフローは dev への push でしか動かない）

## Decisions

### ルールの反映は Pages の公開の前の別ジョブにする

`build` → `rules` → `deploy` の順にし、`deploy` を `needs: [build, rules]` にする。

- ルールを先に反映するので、新しいアプリがルールより先に届く時間がない。今回の不具合は、アプリが先に公開されてルールが古いまま残ったことで起きた
- lint・テスト・ビルドが通ったコミットのルールだけを反映するよう、`rules` は `build` の後にする
- 別案: `deploy` ジョブの中で反映する。`deploy` は `github-pages` environment で動くので、Firebase の Secret もその environment に置くことになり、権限の範囲が分かりにくくなる。失敗したときにどちらで止まったかもログで分けにくいので採らない

### 反映には firebase-tools を npx で、メジャーバージョンを固定して使う

`npx -y firebase-tools@14 deploy --only firestore:rules --project "$PROJECT_ID" --non-interactive` を使う。README の手作業の手順と同じコマンドなので、手でも CI でも同じ結果になる。

- 別案: `devDependencies` に firebase-tools を足す。`build` ジョブの `npm ci` がかなり重くなるうえ、アプリのビルドには使わないので採らない
- 反映先のプロジェクト ID は、既存の Variable `VITE_FIREBASE_PROJECT_ID` を使う。アプリの接続先と反映先が必ず一致する

### 認証はサービスアカウントの鍵を Secret に置き、`google-github-actions/auth` で読み込む

- Secret `FIREBASE_SERVICE_ACCOUNT` にサービスアカウントの鍵（JSON）を置く。`google-github-actions/auth@v2` の `credentials_json` に渡すと `GOOGLE_APPLICATION_CREDENTIALS` が設定され、firebase-tools がそれを使う
- サービスアカウントに付けるロールは **Firebase ルール管理者**（`roles/firebaserules.admin`）と、firebase-tools が API の有効化状態を確かめるための **Service Usage ユーザー**（`roles/serviceusage.serviceUsageConsumer`）の 2 つ。Firestore のデータは読み書きできない
- 別案: Workload Identity 連携（鍵なし）。鍵を持たずに済むが、GCP 側でプールとプロバイダの設定が必要になる。個人のプロジェクトでは手順の重さに見合わないので、鍵の方式にする。鍵の漏えいリスクは、ロールを絞ることで抑える
- 別案: `firebase login:ci` のトークン。firebase-tools で非推奨になっていて、個人の Google アカウントの全権限を持つので採らない

### Secret が無いときは失敗させる

Secret が未設定なら `rules` ジョブは認証で失敗し、`deploy` も動かない。Secret が無いときに反映を飛ばすと、今回と同じずれが黙って起きるため。

## Risks / Trade-offs

- [ルールを反映したあと Pages の公開だけ失敗し、新しいルールと古いアプリの組み合わせになる] → ルールの変更はこれまでどおり、書き込める範囲を足す方向にとどめる。足すだけなら古いアプリはそのまま動く。範囲を狭めるときは、先にアプリを公開してからルールを変える（README に書く）
- [サービスアカウントのロールが足りず、初回の `rules` ジョブが 403 で落ちる] → 落ちたときのログに出る権限名を見てロールを足す。README に必要なロールを書いておく。初回は workflow_dispatch で動作を確かめる
- [鍵の漏えい] → ロールをルールの反映だけに絞る。漏れたらコンソールで鍵を無効にして作り直す
- [firebase-tools のメジャーアップデートでコマンドが変わる] → メジャーバージョンを固定する。上げるときは手で確かめてから変える

## Migration Plan

1. 先に今の `firestore.rules` を手で反映し、不具合を直す（ワークフローの変更を待たない）
2. エラーが出ていた端末でアプリを開き直し、同期に戻ることを確かめる
3. サービスアカウントと Secret を用意してから、ワークフローの変更を dev に入れる
4. 戻すとき: ワークフローの `rules` ジョブを外し、`deploy` の `needs` を `build` に戻す。反映済みのルールはそのまま残るので、アプリへの影響はない
