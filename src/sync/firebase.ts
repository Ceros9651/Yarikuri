// Firebase の SDK はこのファイルからだけ読み込む。サインインしない端末で読み込まないよう、
// 呼び出し側は dynamic import で使う
import { FirebaseError, initializeApp } from 'firebase/app';
import {
  browserPopupRedirectResolver,
  GoogleAuthProvider,
  indexedDBLocalPersistence,
  initializeAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDocFromServer,
  getDocsFromServer,
  initializeFirestore,
  memoryLocalCache,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
  writeBatch,
  type DocumentSnapshot,
  type Firestore,
} from 'firebase/firestore';
import type { FirebaseConfig } from './config';
import {
  SyncError,
  type Cursor,
  type RemoteDoc,
  type SyncAuth,
  type SyncRemote,
  type SyncUser,
} from './remote';

export interface FirebaseServices {
  auth: SyncAuth;
  createRemote(uid: string): SyncRemote;
}

let services: FirebaseServices | undefined;

/** Firebase の窓口を作る。何度呼んでも同じものを返す */
export function createFirebaseServices(config: FirebaseConfig): FirebaseServices {
  if (!services) {
    const app = initializeApp(config);
    // オフライン用の保存は Dexie が受け持つので、Firestore はメモリキャッシュで使う
    const db = initializeFirestore(app, {
      localCache: memoryLocalCache(),
      ignoreUndefinedProperties: true,
    });
    services = {
      auth: createAuth(
        // リダイレクトは GitHub Pages と authDomain のオリジンが違うと結果を受け取れないため、ポップアップを使う
        initializeAuth(app, {
          persistence: indexedDBLocalPersistence,
          popupRedirectResolver: browserPopupRedirectResolver,
        }),
      ),
      createRemote: (uid) => createRemote(db, uid),
    };
  }
  return services;
}

// ---- サインイン ----

function toSyncUser(user: User): SyncUser {
  return { uid: user.uid, email: user.email ?? '' };
}

/** アカウント選択を閉じた・ポップアップを開き直したときのエラー。サインインしなかったものとして扱う */
const CANCELLED_CODES = ['auth/popup-closed-by-user', 'auth/cancelled-popup-request'];

function createAuth(auth: ReturnType<typeof initializeAuth>): SyncAuth {
  return {
    onChange(callback) {
      return onAuthStateChanged(auth, (user) => callback(user ? toSyncUser(user) : null));
    },
    async signIn() {
      try {
        const result = await signInWithPopup(auth, new GoogleAuthProvider());
        return toSyncUser(result.user);
      } catch (e) {
        if (e instanceof FirebaseError && CANCELLED_CODES.includes(e.code)) return null;
        throw e;
      }
    },
    signOut: () => signOut(auth),
  };
}

// ---- クラウドのデータ ----

function toSyncError(e: unknown): SyncError {
  if (e instanceof SyncError) return e;
  const message = e instanceof Error ? e.message : String(e);
  if (e instanceof FirebaseError) {
    switch (e.code) {
      case 'permission-denied':
      case 'unauthenticated':
        return new SyncError('permission-denied', message);
      case 'resource-exhausted':
        return new SyncError('quota', message);
      case 'unavailable':
        return new SyncError('offline', message);
    }
  }
  return new SyncError('other', message);
}

/** 失敗を SyncError にして投げ直す */
async function wrap<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise;
  } catch (e) {
    throw toSyncError(e);
  }
}

function toCursor(value: unknown): Cursor {
  return value instanceof Timestamp
    ? { seconds: value.seconds, nanoseconds: value.nanoseconds }
    : { seconds: 0, nanoseconds: 0 };
}

function toRemoteDoc(snapshot: DocumentSnapshot): RemoteDoc {
  return {
    docId: snapshot.id,
    data: snapshot.get('data') ?? null,
    deleted: snapshot.get('deleted') === true,
    syncedAt: toCursor(snapshot.get('syncedAt')),
  };
}

/** データは users/{uid}/{表}/{docId} に { data, deleted, syncedAt } で置く（firestore.rules） */
function createRemote(db: Firestore, uid: string): SyncRemote {
  const root = doc(db, 'users', uid);

  return {
    async hasCloudData() {
      return (await wrap(getDocFromServer(root))).exists();
    },

    async fetchAll(table) {
      const snapshot = await wrap(getDocsFromServer(collection(root, table)));
      return snapshot.docs.map(toRemoteDoc);
    },

    async write(docs) {
      const batch = writeBatch(db);
      for (const { table, docId, record } of docs) {
        batch.set(doc(root, table, docId), {
          data: record,
          deleted: record === null,
          syncedAt: serverTimestamp(),
        });
      }
      await wrap(batch.commit());
    },

    async markInitialized() {
      await wrap(setDoc(root, { initializedAt: serverTimestamp() }));
    },

    subscribe(table, after, onDocs, onError) {
      const ref = collection(root, table);
      const q = after
        ? query(
            ref,
            where('syncedAt', '>', new Timestamp(after.seconds, after.nanoseconds)),
            orderBy('syncedAt'),
          )
        : query(ref, orderBy('syncedAt'));
      return onSnapshot(
        q,
        (snapshot) => {
          const docs = snapshot
            .docChanges()
            // 自分の送信中の記録（クラウドの時刻がまだ付いていないもの）は飛ばす
            .filter((change) => change.type !== 'removed' && !change.doc.metadata.hasPendingWrites)
            .map((change) => toRemoteDoc(change.doc));
          onDocs(docs, !snapshot.metadata.fromCache);
        },
        (error) => onError(toSyncError(error)),
      );
    },
  };
}
