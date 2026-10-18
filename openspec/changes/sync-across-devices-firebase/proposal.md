# Proposal

## Why

データはスマホのブラウザ（IndexedDB）にしか保存されないため、PC で収支を見るにはエクスポートしたファイルを毎回 PC にインポートするしかなく、その時点の写しにしかならない。PC でもスマホでも同じ収支が表示されるよう、Google でサインインした端末どうしでデータを自動で同期できるようにする（PBI-2）。

## What Changes

- Firebase（Authentication の Google サインインと Cloud Firestore）を使い、サインインした端末どうしで口座・カテゴリ・取引・予算を自動で同期する。接続先の構成（Firestore、`VITE_FIREBASE_*` を GitHub の Variables で渡す、ルールは手元から反映、無料の Spark プラン）は Jisaku-Jira にそろえる。Firebase プロジェクトは Yarikuri 用に新しく作る。
- サインインは任意とする。サインインしなければ今までどおり端末の中だけで使える。設定画面に「同期」を追加し、Google でサインイン・サインアウト・同期の状態（最後に同期した日時、まだ送れていない変更の有無、エラー）を表示する。
- どの端末でも閲覧と入力・編集ができる。オフラインでも今までどおり入力・閲覧でき、通信が戻ったときに送受信する。同じ記録を別々の端末で変えた場合は、後から送った変更が残る。
- データはサインインした Google アカウント専用の場所に保存し、本人以外は読み書きできないようにする（Firestore のセキュリティルール）。**BREAKING**（仕様上の変更: 「外部のサーバーへ送信しない」を「サインインした場合だけ、本人専用の Firebase に保存する」に改める）
- 端末で初めてサインインしたとき:
  - クラウドにまだデータが無ければ、確認のうえ端末のデータをクラウドへ上げる。
  - クラウドにデータがあれば、端末のデータをクラウドの内容で置き換える。端末に取引が記録されている場合は、置き換える前に「ファイルに書き出す」を選べる確認を出す（既定の「財布」や初期カテゴリが二重にならないよう、端末とクラウドは混ぜない）。
- サインイン中のインポートは、同期している全端末のデータを置き換える（確認の文言でそのことを示す）。
- PC 向けのレイアウトは扱わない（PC のブラウザでも今のスマホ幅の画面のまま表示する）。

## Capabilities

### New Capabilities

- `data-sync`: Google サインインによる端末間の同期。サインイン・サインアウト、自動送受信、オフライン時の扱い、競合時の扱い、初回サインイン時のデータの扱い、同期の状態表示、本人以外がデータに触れられないこと。

### Modified Capabilities

- `pwa-app`: 「端末内保存とプライバシー」要件を、サインインしない場合は端末内だけに保存し、サインインした場合は本人専用の Firebase にも保存する内容に改める。ログインなしで使い始められることは変えない。
- `data-backup`: 「JSON インポート」要件に、サインイン中は同期している全端末のデータが置き換わることと、その確認を加える。

## Impact

- 依存: `firebase`（Authentication・Firestore）を追加する。
- `src/sync/`（新規）: Firebase の窓口（`SyncRemote` インターフェース・Firestore 実装・設定なしの実装）、送受信の処理、初回サインイン時の処理。
- `src/db/db.ts`: 送れていない変更を覚える表と、同期の状態を `meta` に追加する（Dexie のスキーマ version 3）。
- `src/db/repository.ts`・`src/db/backup.ts`・`src/db/seed.ts`: 書き込みと同じトランザクションで「送る必要のある記録」を記録する。
- `src/components/settings/SyncSection.tsx`（新規）・`src/pages/SettingsPage.tsx`・`src/components/settings/BackupSection.tsx`: 同期の UI と、インポート確認の文言。
- `src/main.tsx`・`src/App.tsx`: 起動時に同期を開始する。
- `firestore.rules`・`firebase.json`・`.env.example`（新規）、`.github/workflows/deploy.yml`（ビルド時に `VITE_FIREBASE_*` を渡す）、README（Firebase の準備手順、「データは外部に送信されない」の記述の更新）。
- 運用: Firebase プロジェクトの作成、Google サインインの有効化、承認済みドメインに `ceros9651.github.io` を追加、ルールの反映、GitHub Variables の登録（手作業）。
- 既存の画面・集計ロジックは、データを Dexie から読む今の形のまま変えない。
