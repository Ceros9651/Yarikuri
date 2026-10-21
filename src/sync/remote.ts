import type { ZodType } from 'zod';
import { accountSchema, budgetSchema, categorySchema, transactionSchema } from '../domain/backup';
import { docIdOf, type SyncRecord, type SyncRecords, type SyncTable } from './docs';

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

/** クラウドに届いた時刻（Firestore の Timestamp と同じ形）。受信の続きの位置に使う */
export interface Cursor {
  seconds: number;
  nanoseconds: number;
}

export function isAfter(a: Cursor, b: Cursor | null): boolean {
  if (!b) return true;
  return a.seconds !== b.seconds ? a.seconds > b.seconds : a.nanoseconds > b.nanoseconds;
}

/** クラウドから受け取った記録。中身の検証は受け取った側で行う */
export interface RemoteDoc {
  docId: string;
  /** 削除されていれば null */
  data: unknown;
  deleted: boolean;
  syncedAt: Cursor;
}

/** クラウドへ送る記録。record が null なら削除の印を送る */
export interface OutgoingDoc {
  table: SyncTable;
  docId: string;
  record: SyncRecord | null;
}

export type SyncErrorKind = 'permission-denied' | 'quota' | 'offline' | 'other';

export class SyncError extends Error {
  readonly kind: SyncErrorKind;

  constructor(kind: SyncErrorKind, message: string) {
    super(message);
    this.name = 'SyncError';
    this.kind = kind;
  }
}

/** 1回の write で送れる最大件数（Firestore のバッチの上限） */
export const MAX_WRITE = 500;

/**
 * サインインしたアカウントのクラウドのデータの窓口。実装は firebase.ts（Firestore）と、
 * テスト用の src/test/fakeCloud.ts。自分の送った記録も subscribe で届く。
 */
export interface SyncRemote {
  /** クラウドにこのアカウントのデータがあるか。サーバーに問い合わせ、通信できなければ reject */
  hasCloudData(): Promise<boolean>;
  /** コレクションの全記録（削除の印を含む）。サーバーから読む */
  fetchAll(table: SyncTable): Promise<RemoteDoc[]>;
  /** MAX_WRITE 件以下をまとめて送る。オフラインなら通信が戻って届くまで終わらない */
  write(docs: readonly OutgoingDoc[]): Promise<void>;
  /** 最初の端末が全データを送り終えた印を付ける */
  markInitialized(): Promise<void>;
  /**
   * after より後にクラウドに届いた記録と、以後の変更を受け取る。fromServer はサーバーと通信して
   * 受け取ったか。戻り値で購読をやめる
   */
  subscribe(
    table: SyncTable,
    after: Cursor | null,
    onDocs: (docs: RemoteDoc[], fromServer: boolean) => void,
    onError: (error: SyncError) => void,
  ): () => void;
}

const schemas: { [T in SyncTable]: ZodType<SyncRecords[T]> } = {
  accounts: accountSchema,
  categories: categorySchema,
  transactions: transactionSchema,
  budgets: budgetSchema,
};

/** クラウドの記録を検証する。形式が違う・docId と中身が合わないときは null */
export function parseRemoteRecord<T extends SyncTable>(
  table: T,
  docId: string,
  data: unknown,
): SyncRecords[T] | null {
  const result = schemas[table].safeParse(data);
  if (!result.success) return null;
  return docIdOf(table, result.data) === docId ? result.data : null;
}
