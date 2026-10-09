import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import type { Account, Category, Transaction } from '../domain/types';

const EMPTY: never[] = [];

/** 全口座（非表示を含む）を並び順で返す。読み込み中は空配列 */
export function useAccounts(): Account[] {
  return useLiveQuery(() => db.accounts.orderBy('sortOrder').toArray(), []) ?? EMPTY;
}

/** 全カテゴリ（非表示を含む）を並び順で返す */
export function useCategories(): Category[] {
  return useLiveQuery(() => db.categories.orderBy('sortOrder').toArray(), []) ?? EMPTY;
}

/** 全取引を返す（残高の算出に全件を使う） */
export function useTransactions(): Transaction[] | undefined {
  return useLiveQuery(() => db.transactions.toArray(), []);
}

export function useLastExportedAt(): string | undefined {
  return useLiveQuery(async () => (await db.meta.get('lastExportedAt'))?.value, []);
}
