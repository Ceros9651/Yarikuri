# Yarikuri

スマホのホーム画面に追加して使う、自分ひとり用の家計簿アプリ（PWA）です。

- 収入・出費・振替（ATM 引き出し、電子マネーのチャージ）・残高調整を記録
- 月ごとの収入・出費・差額、口座ごとの残高、カテゴリ別の内訳、クレジットカード別の利用額を表示
- ログインせずにすぐ使えます。データはこの端末のブラウザ内（IndexedDB）に保存され、外部には送信されません
- 「設定」→「同期」で Google アカウントにサインインすると、同じアカウントでサインインしたスマホと PC で同じデータを見たり入力したりできます（データは自分のアカウント専用の Firebase に保存されます）
- 通信がなくても使えます。同期している端末では、通信が戻ったときに送受信します

公開 URL: <https://ceros9651.github.io/Yarikuri/>

## 使い方

### ホーム画面に追加する

#### iPhone（Safari）

1. Safari で公開 URL を開く
2. 画面下の共有ボタン（□に↑）をタップ
3. 「ホーム画面に追加」を選んで「追加」

#### Android（Chrome）

1. Chrome で公開 URL を開く
2. 右上のメニュー（︙）から「ホーム画面に追加」または「アプリをインストール」を選ぶ

### 必ずホーム画面のアイコンから起動する

iPhone では、ホーム画面に追加したアプリと Safari でデータの保存場所が別です。Safari で入力したデータはホーム画面のアプリには表示されません。記録は常にホーム画面のアイコンから起動して行ってください。

### はじめにやること

1. 「設定」→「口座・カード」で、銀行口座・電子マネー・クレジットカードを登録する
2. 財布や銀行口座には、使い始める時点の残高を「初期残高」として入れる（既定の「財布」は「編集」から変更）
3. 「入力」から日々の収入・出費を記録する

### クレジットカードについて

カードで支払った出費は、使った日の出費として記録され、カード別の利用額に表示されます。カードの引き落としは記録しないので、アプリ上の銀行残高は実際より多くなります。ずれたら「入力」→「残高調整」で実際の残高に合わせてください（残高調整は月の出費には含まれません）。

### スマホと PC で同じデータを使う（同期）

1. いつも使っているスマホで、念のため「設定」→「バックアップ」→「エクスポート」で控えを保存する
2. スマホで「設定」→「同期」→「Google でサインイン」を押し、確認で「OK」を選ぶ（スマホのデータがクラウドに保存される）
3. PC のブラウザで公開 URL を開き、「設定」→「同期」から同じ Google アカウントでサインインする（PC がスマホと同じ内容になる）

- 先にデータの入っている端末をつなぎ、あとから他の端末をつなぐ。あとからつないだ端末に取引があると、その端末のデータはクラウドの内容で置き換わる（置き換える前に確認が出て、ファイルに書き出せる）
- 以後はどの端末で入力・編集・削除しても、他の端末に自動で反映される。通信がないときに記録した分は、通信が戻ったときに送られる
- 同じ取引を別々の端末で同時に変えたときは、後から送られた変更が残る
- サインイン中にインポートすると、同期しているすべての端末のデータが置き換わる
- サインアウトしても端末のデータは残る（以後は同期しない）
- 「設定」→「同期」で、最後に同期した日時と、送れていない変更があるかを確認できる

### 定期的にバックアップする

同期していない場合、データは端末の中にしかありません。機種変更や端末の故障、ブラウザのデータ削除に備えて、ときどき「設定」→「バックアップ」→「エクスポート」で JSON ファイルを保存してください。新しい端末では「インポート」でそのファイルを選ぶと復元できます（今のデータはすべて置き換わります）。

## 開発

Node.js 24 以降が必要です。

```sh
npm install            # 依存関係のインストール
npm run dev            # 開発サーバー（http://localhost:5173/Yarikuri/）
npm test               # テスト（Vitest）
npm run lint           # ESLint と Prettier のチェック
npm run format         # Prettier で整形
npm run build          # 本番ビルド（dist/）
npm run preview        # ビルド結果の確認（http://localhost:4173/Yarikuri/）
npm run generate-icons # public/icon.svg からアプリアイコンを生成
```

### UI レビュー（/ui-review）

Claude Code で、画面の「AI が作ったっぽさ」（角丸カードの多用、飾りの絵文字、グラデーション・影、均一な余白と中央寄せ）を見つけ、実在アプリを参考にした直し方を選択式で相談し、OpenSpec の change として起票できます。

```text
/ui-review ホーム                          # 画面をレビュー → 選択式で相談 → change（ui-refine-home）を起票
/ui-review --verify ui-refine-home         # 実装後に Before/After のスクショで確認
```

- 画面名: ホーム / 取引一覧 / 取引の編集 / 入力 / 設定 / タブバー（`.claude/skills/ui-review/SKILL.md` の画面一覧）
- スクショは Playwright MCP（`.mcp.json`）で撮ります。初回は Claude Code を再起動して `playwright` サーバーを許可してください。撮影用のブラウザにはサンプルデータが入ります（端末のデータには触れません）
- 採用した方針は `docs/design-principles.md` に溜まり、新しく画面を作るときにも従います（`CLAUDE.md`）
- 初回は参考アプリの候補が出るので、選んだものが `.claude/skills/ui-review/references.md` に登録されます
- 実装は起票された change を使って、いつもの OpenSpec のフローで行います

### 同期（Firebase）の準備

同期には Firebase（Authentication の Google ログインと Cloud Firestore）を使う。手元で同期を試すときは、接続設定を `.env.local` に置く（`*.local` はコミットされない）。[.env.example](.env.example) をコピーして、Firebase コンソールの **プロジェクトの設定 → マイアプリ（ウェブ）** に出る `apiKey` / `authDomain` / `projectId` / `appId` を入れる。

```sh
cp .env.example .env.local   # 値を入れる
npm run dev
```

設定が無いと、設定画面の同期の欄に「同期の接続先が設定されていません」と出て、サインインできない（それ以外の機能は使える）。テストは `.env.local` があっても Firebase にはつながず、偽のクラウドで動く。

Firebase プロジェクトを新しく用意する手順:

1. [Firebase コンソール](https://console.firebase.google.com/) でプロジェクトを作る。支払い方法は登録せず、無料プラン（Spark）のままにする。上限（1日 読み取り 5 万回・書き込み 2 万回など）を超えても課金されず、その日は同期できなくなるだけ
2. **Authentication → ログイン方法** で Google を有効にする。**Authentication → 設定 → 承認済みドメイン** に `ceros9651.github.io` を追加する
3. **Firestore Database** を作成する。ロケーションは `asia-northeast1`（東京）、**本番環境モード**で始める
4. **プロジェクトの設定 → マイアプリ** でウェブアプリ（`</>`）を追加し、`firebaseConfig` の値を控える（Hosting は不要）
5. [firestore.rules](firestore.rules) を反映する。ルールは `users/{uid}` の下を本人だけが読み書きできるようにし、他のパスと削除を拒否する

   ```sh
   npx firebase-tools login
   npx firebase-tools deploy --only firestore:rules --project <projectId>
   ```

   CLI を使わない場合は、コンソールの **Firestore Database → ルール** に firestore.rules の中身を貼って公開する。ルールを変えたときはやり直す（CI はルールを反映しない）

6. GitHub の **Settings → Secrets and variables → Actions → Variables** に `VITE_FIREBASE_API_KEY` / `VITE_FIREBASE_AUTH_DOMAIN` / `VITE_FIREBASE_PROJECT_ID` / `VITE_FIREBASE_APP_ID` を登録する。Web 用の Firebase 設定はページから誰でも見える値なので、Secrets ではなく Variables に置く

### デプロイ

`dev` ブランチに push すると、GitHub Actions（`.github/workflows/deploy.yml`）が lint・テスト・ビルドを行い、GitHub Pages に公開します。初回だけ、リポジトリの Settings → Pages で Source を「GitHub Actions」にしてください。

### 構成

| ディレクトリ                    | 内容                                                         |
| ------------------------------- | ------------------------------------------------------------ |
| `src/domain/`                   | 残高・月次集計・入力チェック・バックアップ検証などの純粋関数 |
| `src/db/`                       | Dexie（IndexedDB）のスキーマと読み書き                       |
| `src/sync/`                     | Firebase との同期（サインイン・送受信・初回の処理）          |
| `src/pages/`, `src/components/` | 画面                                                         |
| `openspec/`                     | 仕様・設計・タスク（OpenSpec）                               |
