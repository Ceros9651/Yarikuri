# Tasks

## 1. Firebase の準備と iPhone でのサインインの確認

- [x] 1.1 Firebase コンソールで Yarikuri 用のプロジェクトを Spark プラン（支払い方法なし）で作り、Firestore を本番モード（`asia-northeast1`）で有効化、Authentication で Google を有効化、承認済みドメインに `ceros9651.github.io` を追加、ウェブアプリを登録して設定値を控える（ユーザーの手作業。設定値が4つそろったことで完了とする）
- [x] 1.2 `npm install firebase` を行い、`.env.example`（`VITE_FIREBASE_API_KEY` / `AUTH_DOMAIN` / `PROJECT_ID` / `APP_ID` の項目名だけ）を追加し、`.github/workflows/deploy.yml` の build ステップに Jisaku-Jira と同じ `env: VITE_FIREBASE_*: ${{ vars.VITE_FIREBASE_* }}` を足す。GitHub の Variables に4つの値を登録してもらい、`npm run build` が通ることを確認する
- [x] 1.3 `src/sync/firebase.ts` に `firebaseConfigFromEnv`（1つでも欠けたら null）と、`initializeAuth`（`indexedDBLocalPersistence` + `browserPopupRedirectResolver`）・`signInWithPopup(GoogleAuthProvider)`・`signOut`・`onAuthStateChanged` を包む `SyncAuth` の実装を作り、`firebaseConfigFromEnv` のテストを足して `npm test` で通ることを確認する
- [x] 1.4 （確認用・後で 6.1 の UI に置き換える）設定画面の末尾に仮の「Google でサインイン」ボタンとメールアドレスの表示を置いて GitHub Pages に出し、iPhone のホーム画面から起動したアプリと PC の Chrome でサインインでき、アプリを閉じて開き直してもサインインが残ることを実機で確かめる。iPhone でサインインの結果が戻らなければ、ここで作業を止め、design.md の Risks の代替案（Firebase Hosting への移行）をユーザーに相談する

## 2. Firestore のルール

- [x] 2.1 design.md のとおりの `firestore.rules` と `firebase.json` をリポジトリの直下に追加し、`npx firebase-tools deploy --only firestore:rules --project <projectId>` で反映する。Rules Playground で「本人の uid で `users/{uid}/transactions/x` に `{data, deleted, syncedAt}` を書ける」「他人の uid・未サインインでは読み書きできない」「`data` 以外の余分なフィールドや、許可していないコレクション名・削除は拒否される」を確かめる

## 3. 送れていない変更の記録（Dexie）

- [x] 3.1 `src/db/db.ts` をスキーマ version 3 にし、`outbox`（主キー `[table+docId]`）を追加、`MetaEntry` の key に `syncUid`・`syncCursor:<collection>`・`lastSyncedAt` を足す。`src/sync/docs.ts` に表ごとの docId の作り方（予算は `${categoryId}__${month}`）と逆変換、`markDirty(db, table, docIds)` を作る。version 2 の DB を開くと記録がそのまま残り `outbox` が空で使えるテストを足し、`npm test` で通ることを確認する
- [x] 3.2 `src/db/repository.ts` の全書き込み関数（口座の追加・変更・非表示、カテゴリの追加・名前変更・非表示・並べ替え、予算の設定・解除、取引の保存・削除）と `src/db/seed.ts` の `ensureSeeded` で、トランザクションに `outbox` を加えて書いた記録を `markDirty` する。`src/db/repository.test.ts` に「各操作のあと outbox に該当の `[table, docId]` が1件ずつ積まれる」「同じ取引を2回保存しても1件で token が変わる」「取引を削除しても outbox に残る」テストを足し、既存テストを含め `npm test` で通ることを確認する
- [x] 3.3 `src/db/backup.ts` の `importData` で、置き換え前と置き換え後の全記録を outbox に積む。「インポート前にあった取引がファイルに無いとき、その取引の docId が outbox に残る」テストを足し、`npm test` で通ることを確認する

## 4. 同期の処理（送信・受信・競合）

- [x] 4.1 `src/sync/remote.ts` に design.md の `SyncRemote` / `SyncAuth` のインターフェースと記録の検証（`src/domain/backup.ts` の zod スキーマを export して使う）を置き、`src/test/fakeCloud.ts` に複数の端末から共有できるメモリ実装（`syncedAt` の採番、購読への配信、オフライン・`permission-denied`・`resource-exhausted` の注入）を作る。検証のテスト（読めない `data` は捨てる）を足して `npm test` で通ることを確認する
- [x] 4.2 `src/sync/engine.ts` に `push`（outbox を 500 件ずつ送り、token が同じものだけ消す、1つしか同時に動かさない、空になったら `lastSyncedAt` を更新）を実装する。fake-indexeddb の2つの `YarikuriDB` と偽クラウドで「端末Aで記録した出費・編集・削除が偽クラウドに届く」「送信中に同じ取引を再度変えると outbox に残り、次の push で新しい内容が届く」「オフライン中は outbox が残り、オンラインに戻すと送られる」テストを足し、`npm test` で通ることを確認する
- [x] 4.3 `engine.ts` に受信（コレクションごとに cursor より新しい変更を購読し、outbox にあるものは飛ばし、tombstone は削除、通知ごとに1トランザクションで書いて cursor を進める）と、きっかけ（開始時・outbox の件数の変化・`online` イベント）を実装する。「端末Aの出費・編集・削除・口座追加・カテゴリ名変更・並べ替え・予算設定が端末Bの Dexie に反映される」「別々の取引の同時の記録は両方残る」「端末Bのオフライン中に同じ取引をA→Bの順にクラウドへ届けると B の内容が両端末に残る」「再起動（購読し直し）しても前回の cursor の続きだけを受け取る」「読めない記録は取り込まない」テストを足し、`npm test` で通ることを確認する
- [x] 4.4 `src/sync/firebase.ts` に Firestore 版の `SyncRemote`（`initializeFirestore` のメモリキャッシュ + `ignoreUndefinedProperties`、`users/{uid}/{collection}` への `writeBatch`、`where('syncedAt','>',cursor)` + `orderBy` の `onSnapshot`、`hasPendingWrites` の除外、エラーコードの変換）を実装し、`npm run typecheck` が通ることを確認する（Firestore への接続は 7.2 で確かめる）

## 5. 初回サインインとサインアウト

- [x] 5.1 `engine.ts` に初回の処理を実装する: クラウドにデータが無ければ全記録を送ってから `markInitialized`、あれば全コレクションを読んで1トランザクションで置き換え（tombstone は入れない、`seeded` を立て、cursor を最大の `syncedAt` に、outbox を空に）、どちらも最後に `syncUid` を記録する。オフラインなら「初めてのサインインには通信が必要です」で失敗させる。「データの無いクラウドに端末Aの全データが上がり、端末Bの初回で同じ内容になり、財布と初期カテゴリが二重にならない」「途中で失敗すると `syncUid` が記録されず、クラウドに `users/{uid}` も作られない」「端末Bにあった取引は置き換えで消える」テストを足し、`npm test` で通ることを確認する
- [x] 5.2 `src/sync/SyncContext.tsx` に Provider を作り、Firebase を dynamic import で読み込む条件（`meta.syncUid` がある、またはサインインを押した）、起動時の再開（サインイン済みで `syncUid` が一致すれば同期を開始、一致しなければサインアウト）、状態（`signedOut` / `linking` / `syncing` / `synced` / `offline` / `error`・メールアドレス・`lastSyncedAt`・未送信の有無・エラーの理由）、サインアウト（購読をやめ、`syncUid`・cursor・`lastSyncedAt` を消し、記録は残す）を持たせて `App` の最上位で包む。偽の `SyncAuth` / `SyncRemote` を Provider に渡せるようにし、「サインインしていなければ Firebase のモジュールを読み込まない」「サインアウト後も取引が残る」テストを足して `npm test` で通ることを確認する

## 6. 設定画面の UI

- [x] 6.1 `src/components/settings/SyncSection.tsx` を作り、設定画面の「バックアップ」の前に置く（1.4 の仮のボタンは消す）。未サインインでは説明文と「Google でサインイン」、サインイン中はメールアドレス・最後に同期した日時・未送信の有無・オフライン／エラーの理由と「サインアウト」を出す。接続設定の無いビルドでは「同期の接続先が設定されていません」と出してボタンを無効にする。docs/design-principles.md に従い、カード・アイコン・バッジ・スピナー・Google のロゴは使わず、既存の `.muted` / `.notice` / `.form-actions` で組む。`src/pages/settings.test.tsx` に未サインイン・同期済み・未送信あり（オフライン）・エラー・未設定の各表示のテストを足し、`npm test` で通ることを確認する
- [x] 6.2 初回サインインの確認を SyncSection の中に出す: クラウドが空なら `window.confirm` で「この端末のデータをクラウドに保存して同期を始めます」、データがあり端末に取引があれば文と「ファイルに書き出す」（BackupSection と同じ書き出し処理を共通化して使う）・「置き換える」・「キャンセル」の文字ボタン、取引が無ければ確認なし。キャンセルはサインアウトしてデータを変えない。サインアウトは未送信があれば `window.confirm` で確かめる。spec の「初めてサインインした端末のデータ」「サインアウト」の各シナリオを偽の窓口で画面テストにし、`npm test` で通ることを確認する
- [x] 6.3 `BackupSection.tsx` の説明文とインポートの確認文を、サインイン中は「同期しているすべての端末のデータも置き換わります」を含むものに出し分ける。`src/pages/backup.test.tsx` にサインイン中の確認文のテストを足し、既存テストを含め `npm test` で通ることを確認する

## 7. ドキュメントと確認

- [x] 7.1 README の「データはこの端末のブラウザ内（IndexedDB）にだけ保存され、外部には送信されません。ログインは不要です」とバックアップの節を、サインインすると同期できることに合わせて書き直し、「PC で使う」（公開 URL を開いて同じ Google アカウントでサインイン）と、開発の節に Firebase の準備（1.1・2.1・Variables・`.env.local`）の手順を Jisaku-Jira の README と同じ粒度で足す。書いた手順どおりに `.env.local` を置いて `npm run dev` で同期のセクションが使えることを確認する
- [x] 7.2 `npm run lint`・`npm test`・`npm run build` が通り、ビルドで Workbox の precache の上限超えの警告が出ないこと、未サインインの状態で開発者ツールの Network に Firebase（`googleapis.com` など）への通信が無いことを確認する
- [ ] 7.3 `dev` に出したあと実機で通しで確かめる: 今のスマホのホーム画面アプリでエクスポートしてからサインインし「保存して同期を始める」→ PC のブラウザでサインインするとスマホと同じホーム・取引一覧になる → PC で出費を記録・編集・削除するとスマホに再読み込みなしで反映される → スマホを機内モードにして出費を記録し、アプリを閉じて機内モードを解除し開き直すと PC に届く → 設定画面の同期の状態がそれぞれの時点で正しく出る
