/** サインインしている Google アカウント */
export interface SyncUser {
  uid: string;
  email: string;
}

/** サインインの窓口。実装は firebase.ts（Firebase Authentication）と、テスト用の偽物 */
export interface SyncAuth {
  /** サインイン状態を受け取る。保存されたサインイン状態があれば、オフラインでも最初に通知される */
  onChange(callback: (user: SyncUser | null) => void): () => void;
  /** Google のアカウント選択を開く。閉じられたら null */
  signIn(): Promise<SyncUser | null>;
  signOut(): Promise<void>;
}
