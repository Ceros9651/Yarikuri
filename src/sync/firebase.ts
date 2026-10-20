// Firebase の SDK はこのファイルからだけ読み込む。サインインしない端末で読み込まないよう、
// 呼び出し側は dynamic import で使う
import { FirebaseError, initializeApp, type FirebaseApp } from 'firebase/app';
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
import type { FirebaseConfig } from './config';
import type { SyncAuth, SyncUser } from './remote';

let app: FirebaseApp | undefined;

function getApp(config: FirebaseConfig): FirebaseApp {
  app ??= initializeApp(config);
  return app;
}

function toSyncUser(user: User): SyncUser {
  return { uid: user.uid, email: user.email ?? '' };
}

/** アカウント選択を閉じた・ポップアップを開き直したときのエラー。サインインしなかったものとして扱う */
const CANCELLED_CODES = ['auth/popup-closed-by-user', 'auth/cancelled-popup-request'];

export function createFirebaseAuth(config: FirebaseConfig): SyncAuth {
  // リダイレクトは GitHub Pages と authDomain のオリジンが違うと結果を受け取れないため、ポップアップを使う
  const auth = initializeAuth(getApp(config), {
    persistence: indexedDBLocalPersistence,
    popupRedirectResolver: browserPopupRedirectResolver,
  });

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
