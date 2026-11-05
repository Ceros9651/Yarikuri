# Proposal

## Why

Google でサインインすると「クラウドのデータを読み書きする権限がありません。サインアウトしてから、サインインし直してください。」と表示され、同期できなくなっている（PBI-41）。2026-11-01 の月の開始日の機能で、端末は `settings` コレクションにも書き込むようになり、リポジトリの `firestore.rules` にも `settings` を足した。ただ、ルールの反映は手動で、CI では反映していない。Firebase に反映されているルールが古いままだと、`settings` への書き込みが `permission-denied` で拒否される。その記録は outbox に残り続けるため、サインインし直しても毎回同じエラーになる。

アプリとルールを別々に反映する運用では、同じずれがまた起きる。そこで、アプリを公開するときにルールも必ず反映するようにする。

## What Changes

- GitHub Actions の公開ワークフロー（`.github/workflows/deploy.yml`）で、GitHub Pages に公開する前に `firestore.rules` を Firebase に反映する。ルールを反映できなければ、アプリも公開しない
- CI がルールを反映するためのサービスアカウントと、その鍵を入れる GitHub Secret を用意する（Firebase / GCP と GitHub の設定。コードの外の作業）
- README の Firebase の手順を書き換える。「CI はルールを反映しない」「ルールを変えたら手で反映し直す」の記述をやめ、CI 用のサービスアカウントと Secret の設定手順を足す
- 今起きている不具合は、今のルールを一度手で反映して直す。反映したあと、エラーになっていた端末でアプリを開き直すと、送れていなかった変更が送られて同期に戻ることを確かめる
- アプリのコード（`src/`）と `firestore.rules` の中身は変えない

## Capabilities

### New Capabilities

（なし）

### Modified Capabilities

- `data-sync`: 公開されたアプリが送る記録は、クラウドのアクセスルールで拒否されないことを要件に足す（アプリとルールを同時に反映する）。ルールが直ったあと、エラーで止まっていた端末が同期に戻るシナリオも足す

## Impact

- `.github/workflows/deploy.yml`: ルールを反映するジョブを足し、Pages への公開をそのジョブの成功後にする
- GitHub リポジトリの設定: Secret `FIREBASE_SERVICE_ACCOUNT` を新しく足す。既存の Variable `VITE_FIREBASE_PROJECT_ID` を反映先に使う
- Firebase / GCP: ルールの反映だけができるサービスアカウントを作る
- `README.md`: Firebase のセットアップ手順
- 利用者: 不具合が出ている端末は、ルールを反映したあとアプリを開き直せば、サインインし直さなくても同期に戻る
