import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import type { Account, Budget, Category, Transaction } from '../domain/types';

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

/** 予算の設定記録をすべて返す */
export function useBudgets(): Budget[] {
  return useLiveQuery(() => db.budgets.toArray(), []) ?? EMPTY;
}

export function useLastExportedAt(): string | undefined {
  return useLiveQuery(async () => (await db.meta.get('lastExportedAt'))?.value, []);
}

export interface AllData {
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  budgets: Budget[];
}

/**
 * 口座・カテゴリ・取引・予算を1回の読み込みでまとめて返す。読み込み中は undefined。
 * 別々に読むと、取引だけ先に届いて口座名やカテゴリ名が空の一瞬が描画されるため、
 * 名前を表示しながら集計する画面ではこちらを使う。
 */
export function useAllData(): AllData | undefined {
  return useLiveQuery(
    () =>
      db.transaction('r', db.accounts, db.categories, db.transactions, db.budgets, async () => ({
        accounts: await db.accounts.orderBy('sortOrder').toArray(),
        categories: await db.categories.orderBy('sortOrder').toArray(),
        transactions: await db.transactions.toArray(),
        budgets: await db.budgets.toArray(),
      })),
    [],
  );
}
