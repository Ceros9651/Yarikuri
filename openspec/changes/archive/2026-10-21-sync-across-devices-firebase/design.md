# Design

## Context

- データは Dexie（IndexedDB）の `accounts` / `categories` / `transactions` / `budgets` / `meta` に置いている（src/db/db.ts、スキーマ version 2）。id は `crypto.randomUUID()` の文字列で、予算だけ `[categoryId+month]` の複合キー。
- 書き込みは src/db/repository.ts・src/db/backup.ts（インポートは全表を clear → bulkAdd）・src/db/seed.ts（初回起動時の「財布」と初期カテゴリ）の関数に限られる。例外として src/pages/EditTransactionPage.tsx が `db.transactions.get` で読んでいる。削除は取引だけで、口座・カテゴリは非表示にするだけ。
- 画面は src/hooks/useData.ts の `useLiveQuery` で Dexie を読んでいて、Dexie が変われば再描画される。
- 検証用の zod スキーマ（口座・カテゴリ・取引・予算）が src/domain/backup.ts にあり、エクスポートファイルの検証に使っている。
- テストは Vitest + fake-indexeddb で、画面テストは src/test/render.tsx の `renderApp`。
- 公開は GitHub Pages（`https://ceros9651.github.io/Yarikuri/`、HashRouter）で、`dev` への push で Actions がビルドする。サーバーは無い。
- Jisaku-Jira の Firebase 構成（`VITE_FIREBASE_API_KEY` / `AUTH_DOMAIN` / `PROJECT_ID` / `APP_ID` を GitHub Variables からビルドに渡す、`firestore.rules` と `firebase.json` をリポジトリに置き手元から反映、Firestore への依存を1つの窓口に閉じ込めてテストでは偽物に差し替える、無料の Spark プラン）にそろえる。

## Goals / Non-Goals

**Goals:**
- 画面・集計・既存のテストは Dexie を読む今の形のまま変えない。同期は Dexie と Firestore のあいだで行う。
- オフラインでも今と同じに動き、送れていない変更はアプリを閉じても失われない。
- サインインしていない端末では Firebase の SDK を読み込まず、通信もしない。
- Firestore と Firebase Authentication への依存を src/sync/ の窓口に閉じ込め、送受信の処理は偽物の窓口でテストできるようにする。

**Non-Goals:**
- PC 向けのレイアウト。
- 項目単位のマージ（同じ記録への競合は記録単位で後勝ち）。
- 複数人での共有、端末ごとの同期のオン・オフ、同期の履歴表示。
- Firestore のルールの自動テスト（エミュレーターには Java が要るため、反映後に Rules Playground で手で確かめる）。
- App Check。

## Decisions

### 正のデータは Dexie のまま、Firestore は端末どうしの中継に使う

- 画面は今までどおり Dexie だけを読む。同期の処理が「Dexie の送れていない変更を Firestore へ送る」「Firestore の変更を Dexie に書く」を受け持つ。Dexie に書けば `useLiveQuery` で画面が更新されるので、他の端末の変更も再読み込みなしで反映される。
- 採らなかった案:
  - Firestore を正のデータにして、永続キャッシュ（`persistentLocalCache`）でオフライン対応する: repository・hooks・既存テストをすべて書き直すことになり、オフライン中は書き込みの Promise がサーバーの応答まで終わらない・トランザクションが使えないため、入力時の検証（残高調整の差額計算など）を作り直す必要がある。
  - Jisaku-Jira と同じく全データを JSON 1件で置く: 取引は年々増え、1MiB の上限と「変更のたびに全体を送受信する」通信量が効いてくる。オフラインで変更した端末どうしの競合も、全体の後勝ちになり別々の取引への変更が消える。
  - Dexie Cloud: 有償のサービスで、ユーザーは Firebase を選んだ。

### Firestore の置き場所: アカウントごと・記録ごとのドキュメント

```text
users/{uid}                          { initializedAt }            クラウドにデータがあるかの印
users/{uid}/{collection}/{docId}     { data, deleted, syncedAt }
  collection: accounts | categories | transactions | budgets
  docId: 記録の id（予算は `${categoryId}__${month}`）
  data: Dexie の記録そのもの（削除したら null）
  deleted: 削除の印（tombstone）。削除も他の端末に伝えるため、ドキュメントは消さない
  syncedAt: serverTimestamp()（クラウドに届いた時刻）
```

- 記録は `data` に包む。Transaction 自身の `updatedAt`（端末の時刻）とクラウドに届いた時刻を混ぜないためと、ルールで許すフィールドを固定するため。
- `undefined` の項目（memo など）は送らない（`ignoreUndefinedProperties: true`）。
- 受け取った `data` は src/domain/backup.ts の zod スキーマ（export する）で検証し、読めない記録は取り込まず、同期の状態に「読めない記録があった」と出す。
- `users/{uid}` は最初の端末が全データを送り終えてから作る。途中で失敗しても「クラウドにデータがある」と誤って判定しない。

### 送れていない変更は `outbox` 表に、書き込みと同じトランザクションで記録する

- Dexie のスキーマを version 3 にし、`outbox`（主キー `[table+docId]`、値 `{ table, docId, token }`）を足す。`meta` の key に `syncUid`・`syncCursor:<collection>`・`lastSyncedAt` を足す。
- repository・backup・seed の各書き込み関数は、トランザクションの対象に `outbox` を加え、書いた（消した）記録の `[table, docId]` を新しい `token`（UUID）で put する。インポートは置き換え前の全記録と置き換え後の全記録を積む（消えた記録は tombstone として送られる）。
- サインインしていなくても積む。最初のサインインで全データを送るか置き換えるので、そのとき `outbox` は空にする。キーが記録ごとなので、積み続けても記録の数より増えない。
- 採らなかった案: Dexie の `creating` / `updating` / `deleting` フック。フックの中ではトランザクションの対象外の表に書けず、同期の処理がクラウドの変更を Dexie に書くときにもフックが動くので、抑止の仕組みが別に要る。書き込み関数が限られているので、明示的に積むほうが読みやすい。
- 書き込み関数ごとの変更は小さく、`markDirty(db, table, docIds)` のような補助を1つ用意する。EditTransactionPage は読むだけなので変えない。

### 送信: outbox を読み、今の Dexie の内容を送る

```text
push():  （1つしか同時に動かさない）
  entries = outbox 全件
  for 500 件ずつ:
    batch: 各 entry について Dexie の今の記録を読み、
           あれば set({ data, deleted:false, syncedAt }), なければ set({ data:null, deleted:true, syncedAt })
    await batch.commit()           // オフラインならつながるまで終わらない
    各 entry を、token が送信前と同じときだけ outbox から消す（送信中に再度変更されたら残して次回送る）
  outbox が空なら lastSyncedAt を更新
```

- きっかけ: 同期の開始時、`outbox` の変化（`liveQuery` で件数を見る）、`online` イベント。
- Firestore はメモリキャッシュで使う（オフライン用の保存は Dexie が受け持つ）。アプリを閉じて Firestore の送信待ちが消えても、`outbox` が残っているので次の起動で送り直す。

### 受信: コレクションごとに `syncedAt` より新しい変更だけを購読する

```text
subscribe(collection, cursor):
  onSnapshot(query(users/{uid}/{collection}, where('syncedAt', '>', cursor), orderBy('syncedAt')))
  変更ごとに:
    hasPendingWrites（自分の送信中のもの）は飛ばす
    検証できないものは飛ばす
    outbox に同じ [table, docId] があれば飛ばす（端末の未送信の変更を優先し、あとで送る＝後勝ち）
    deleted なら Dexie から消す、そうでなければ data を put
  1回の通知ぶんを1つの Dexie トランザクションで書き、同じトランザクションで syncCursor を最大の syncedAt に進める
```

- 起動のたびに全件を読み直さず、前回の続きから受け取るので、読み取りの回数は変更の数で済む（無料枠は1日 5 万回）。
- 自分が送った変更もサーバーの `syncedAt` が付いて届くが、同じ内容を put するだけなので害はない。
- `fromCache` でない通知を受け取ったら `lastSyncedAt` を更新する。

### 競合は記録単位の後勝ち

- 上の受信の規則で、他の端末の変更が届いたときに端末側に未送信の変更があれば端末側を残して送るので、クラウドに後から届いた変更が全端末に残る（spec の「同じ記録への競合する変更」）。
- 口座・カテゴリの `sortOrder` はカテゴリごとの記録なので、2台で同時に並べ替えると混ざった並びになりうる。並べ替えはまれなので受け入れる。

### 初めてサインインした端末: 混ぜずに「送る」か「置き換える」

`meta.syncUid` がサインインしたアカウントの uid と違う（または無い）ときに行う。通信が必要で、できなければ「初めてのサインインには通信が必要です」と出してサインアウトする。

1. `users/{uid}` をサーバーから読む。
2. 無い: 「この端末のデータをクラウドに保存して同期を始めます」と確認し、同意したら Dexie の全記録を 500 件ずつ送り、最後に `users/{uid}` を作る。`outbox` を空にし、`syncUid` を記録する。cursor は空のままにする（最初の購読で自分の送ったぶんを一度受け取るが、同じ内容なので害はない）。
3. ある: 端末に取引が1件以上あれば、「この端末のデータはクラウドの内容で置き換わります」と、「ファイルに書き出す」（既存のエクスポートと同じ処理）・「置き換える」・「キャンセル」を出す。置き換えるときは、全コレクションを `getDocs` で読み、検証し、1つの Dexie トランザクションで全表を clear して tombstone 以外を入れ、`meta.seeded` を立て、cursor を各コレクションの最大 `syncedAt` にし、`outbox` を空にし、`syncUid` を記録する。
4. キャンセル: サインアウトし、Dexie には触れない。
5. 起動時にサインイン済みなのに `syncUid` が一致しない（初回の処理の途中でアプリが閉じられた）場合は、サインアウトして未サインインの状態から始める。

- 既定の「財布」と初期カテゴリは端末ごとに別の id で作られるため、混ぜると二重になる。混ぜない理由はこれ。

### サインアウト

- `outbox` が空でなければ、送れていない変更が他の端末に届かないことを `window.confirm` で確かめる。
- 購読をやめ、Firebase からサインアウトし、`meta` の `syncUid`・cursor・`lastSyncedAt` を消す。Dexie の記録と `outbox` は残す（再サインインは初回扱いなので、そこで空にされる）。

### Firebase の読み込みと初期化

- `firebase/app`・`firebase/auth`・`firebase/firestore` は dynamic import で読み、`meta.syncUid` があるときか「Google でサインイン」を押したときだけ読み込む。サインインしない端末は Firebase に通信しない（spec の「サインインしていなければ送信しない」）。
- Auth は `initializeAuth(app, { persistence: indexedDBLocalPersistence, popupRedirectResolver: browserPopupRedirectResolver })`。オフラインで起動しても、保存されたサインイン状態で同期の処理を始められる（つながるまで送受信は待つ）。
- サインインは `signInWithPopup(GoogleAuthProvider)`。`signInWithRedirect` は、GitHub Pages のオリジンと `authDomain`（`<project>.firebaseapp.com`）が別で、Safari などのサードパーティストレージの制限で戻ってきた結果を受け取れないため使わない（Firebase の「サードパーティのストレージをブロックするブラウザ」のガイドの対象）。
- 接続設定（`VITE_FIREBASE_*`）が欠けたビルドでは、同期のセクションに「同期の接続先が設定されていません」と出し、サインインのボタンを押せなくする（Jisaku-Jira の `unconfiguredRemote` と同じ考え方）。

### 窓口と状態

```ts
// src/sync/remote.ts
interface SyncRemote {
  hasCloudData(): Promise<boolean>;
  fetchAll(collection): Promise<RemoteDoc[]>;            // 初回の置き換え用。tombstone を含む
  write(docs: OutgoingDoc[]): Promise<void>;             // 500 件以下。1つのバッチで commit
  markInitialized(): Promise<void>;
  subscribe(collection, after: Cursor | null, onDocs, onError): () => void;
}
interface SyncAuth {
  onChange(cb: (user: { uid: string; email: string } | null) => void): () => void;
  signIn(): Promise<{ uid: string; email: string } | null>; // 閉じられたら null
  signOut(): Promise<void>;
}
```

- Firestore・Auth の実装は src/sync/firebase.ts、送受信と初回の処理は src/sync/engine.ts（Dexie と `SyncRemote` だけに依存）。テストは src/test/ のメモリ実装（2台の端末＝2つの Dexie で1つの偽クラウドを共有、オフライン・失敗を注入できる）で行う。
- 同期の状態（`signedOut` / `linking` / `syncing` / `synced` / `offline` / `error`、メールアドレス、`lastSyncedAt`、未送信の有無、エラーの理由）は src/sync/SyncContext.tsx の Provider が持ち、App の最上位で包む。未送信の有無は `outbox` の件数を `useLiveQuery` で見る。
- エラーの理由は Firestore のエラーコードで分ける: `permission-denied`（権限がない）、`resource-exhausted`（無料枠の上限）、`unavailable` やオフラインは「オフラインのため、通信が戻ったら送ります」。

### セキュリティルール

```text
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid} {
      allow read: if request.auth != null && request.auth.uid == uid;
      allow create: if request.auth != null && request.auth.uid == uid
                    && request.resource.data.keys().hasOnly(['initializedAt'])
                    && request.resource.data.initializedAt == request.time;
      match /{collection}/{docId} {
        allow read: if request.auth != null && request.auth.uid == uid;
        allow create, update: if request.auth != null && request.auth.uid == uid
                              && collection in ['accounts', 'categories', 'transactions', 'budgets']
                              && request.resource.data.keys().hasOnly(['data', 'deleted', 'syncedAt'])
                              && request.resource.data.deleted is bool
                              && request.resource.data.syncedAt == request.time;
      }
    }
  }
}
```

- 他のパスは既定で拒否。ドキュメントの削除は許さない（削除は tombstone で表す）。Jisaku-Jira と同じく `firebase deploy --only firestore:rules` で手元から反映し、CI では反映しない。
- Google アカウントを持っていれば誰でも自分用の領域を作れるが、他人のデータには触れられない。無料枠を他人に使われる心配が出たら、許可する uid を絞る（別 change）。

### 設定値の受け渡し

- Jisaku-Jira と同じ 4 つの `VITE_FIREBASE_*` を、手元は `.env.local`（`*.local` は .gitignore 済み）、CI は GitHub Variables から deploy.yml の build ステップの `env` で渡す。`.env.example` に項目名だけ置く。
- Firebase コンソールの Authentication → 承認済みドメインに `ceros9651.github.io` を足す（`localhost` は既定で入っている）。

### UI

- 設定画面の「バックアップ」の前に「同期」のセクションを置く。docs/design-principles.md に従い、見出し＋説明文＋既存の `.notice` / `.muted` / `.form-actions` のボタンだけで組み、飾りのアイコンやバッジ、スピナーは使わない。Google のロゴも使わず、ボタンは文字だけ。
- 初回サインインの確認は3択（書き出す・置き換える・キャンセル）になるため `window.confirm` では足りず、同期のセクションの中にその場で文と文字ボタンを出す。2択の確認（最初の端末の送信、サインアウト、インポート）は既存と同じ `window.confirm` を使う。
- BackupSection の説明文「データはこの端末の中にだけ保存されています」は、サインイン中は「同期しているすべての端末のデータが置き換わります」の文脈に合わせて出し分け、インポートの確認文にもそれを足す。

## Risks / Trade-offs

- [iPhone のホーム画面アプリ（standalone）で `signInWithPopup` のポップアップから結果が戻らない可能性がある] → タスクの最初に、最小の実装を GitHub Pages に出して実機（ホーム画面から起動）で確かめる。だめな場合は、公開先を Firebase Hosting に移して `authDomain` を同じオリジンにし `signInWithRedirect` を使う案に切り替える。その場合は URL が変わり IndexedDB も別になるため、旧 URL でサインインしてクラウドへ送ってから新 URL でサインインする移行手順を足す（ユーザーに相談してから change を更新する）。
- [初回のサインインで、データのあるクラウドに対して端末のデータを置き換えると、端末にしかなかった記録は消える] → 取引がある端末では確認の中で書き出しを選べるようにする。
- [オフラインの端末どうしで同じ記録を変えると、先に届いた変更は消える] → 自分ひとりの利用ではまれとして受け入れる（spec のとおり）。
- [cursor（`syncedAt`）より前の変更を取りこぼす] → `syncedAt` はサーバーのコミット時刻で、スナップショットはその読み取り時刻までのコミットをすべて含むため、cursor を「受け取った最大の `syncedAt`」に進める限り取りこぼさない。万一ずれても、該当記録を次に変更したときにそろう。
- [Firebase の SDK でアプリが重くなる] → dynamic import でサインインした端末だけが読み込む。Workbox の precache の 1 ファイルあたりの上限（既定 2MiB）を超えないことをビルドで確かめる。
- [無料枠（1日 読み取り 5 万・書き込み 2 万）] → 支払い方法を登録しない Spark プランで使う。超えても課金されず、その日の同期が失敗して状態に表示されるだけ。新しい端末の初回だけ全件を読む（取引が数千件でも届かない）。
- [Firebase の Web 設定（API キー）がビルドに含まれる] → 秘密ではない値で、データはルールで本人に限るので問題ない。
- [ID トークンの期限切れ・アカウントの無効化] → Firebase SDK が更新する。更新できず `permission-denied` になったら状態にエラーとして出し、サインインし直してもらう。

## Migration Plan

1. Firebase コンソールで Yarikuri 用のプロジェクトを Spark プランで作り、Firestore を本番モード（`asia-northeast1`）で有効化、Authentication で Google を有効化、承認済みドメインに `ceros9651.github.io` を足し、ウェブアプリを登録して設定値を控える（手作業）。
2. `firebase deploy --only firestore:rules` でルールを反映し、Rules Playground で他人の uid・未サインインの読み書きが拒否されることを確かめる。
3. GitHub の Variables に 4 つの値を登録し、`dev` に push して公開する。
4. 今使っているスマホのホーム画面アプリで、念のためエクスポートしてからサインインし、「保存して同期を始める」を選ぶ。次に PC のブラウザで公開 URL を開いてサインインする。
5. ロールバック: 以前のコミットに戻して公開し直す。各端末の Dexie のデータはそのまま残る（version 3 の `outbox` 表は旧版でも無視される。Dexie は新しいバージョンの DB を旧コードで開くとエラーになるため、ロールバック版では `db.version(3)` の定義だけ残す）。
