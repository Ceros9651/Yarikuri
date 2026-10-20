// Firebase の SDK を読み込まずに使えるよう、接続設定の判定はここに分ける

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
}

type Env = Partial<
  Record<
    | 'VITE_FIREBASE_API_KEY'
    | 'VITE_FIREBASE_AUTH_DOMAIN'
    | 'VITE_FIREBASE_PROJECT_ID'
    | 'VITE_FIREBASE_APP_ID',
    string
  >
>;

/** ビルド時の環境変数から接続設定を作る。1つでも欠けていれば null */
export function firebaseConfigFromEnv(env: Env): FirebaseConfig | null {
  const config = {
    apiKey: env.VITE_FIREBASE_API_KEY?.trim() ?? '',
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN?.trim() ?? '',
    projectId: env.VITE_FIREBASE_PROJECT_ID?.trim() ?? '',
    appId: env.VITE_FIREBASE_APP_ID?.trim() ?? '',
  };
  return Object.values(config).every((v) => v !== '') ? config : null;
}

export const firebaseConfig = firebaseConfigFromEnv(import.meta.env);

export const UNCONFIGURED_MESSAGE = '同期の接続先が設定されていません';
