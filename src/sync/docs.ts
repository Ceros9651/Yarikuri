import type { Account, Budget, Category, Transaction } from '../domain/types';
import type { YarikuriDB } from '../db/db';

/** 端末どうしで同期する表。Firestore のコレクション名も同じ */
export const SYNC_TABLES = ['accounts', 'categories', 'transactions', 'budgets'] as const;
export type SyncTable = (typeof SYNC_TABLES)[number];

export interface SyncRecords {
  accounts: Account;
  categories: Category;
  transactions: Transaction;
  budgets: Budget;
}
export type SyncRecord = SyncRecords[SyncTable];

/** 送れていない変更。書いた（消した）記録ごとに1件。token は書くたびに変わる */
export interface OutboxEntry {
  table: SyncTable;
  docId: string;
  token: string;
}

const BUDGET_SEPARATOR = '__';

export function budgetDocId(categoryId: string, month: string): string {
  return `${categoryId}${BUDGET_SEPARATOR}${month}`;
}

/** 予算の docId を Dexie のキー [categoryId, month] に戻す */
export function budgetKeyOf(docId: string): [string, string] {
  const i = docId.lastIndexOf(BUDGET_SEPARATOR);
  return [docId.slice(0, i), docId.slice(i + BUDGET_SEPARATOR.length)];
}

export function docIdOf<T extends SyncTable>(table: T, record: SyncRecords[T]): string {
  if (table === 'budgets') {
    const budget = record as Budget;
    return budgetDocId(budget.categoryId, budget.month);
  }
  return (record as Account | Category | Transaction).id;
}

/** docId の記録を Dexie から読む。無ければ undefined */
export function readRecord(
  db: YarikuriDB,
  table: SyncTable,
  docId: string,
): Promise<SyncRecord | undefined> {
  if (table === 'budgets') return db.budgets.get(budgetKeyOf(docId));
  return db[table].get(docId);
}

export async function putRecord(db: YarikuriDB, table: SyncTable, record: SyncRecord) {
  await (db[table] as YarikuriDB['accounts']).put(record as Account);
}

export async function deleteRecord(db: YarikuriDB, table: SyncTable, docId: string) {
  if (table === 'budgets') await db.budgets.delete(budgetKeyOf(docId));
  else await db[table].delete(docId);
}

/** 表のすべての記録の docId */
export async function allDocIds(db: YarikuriDB, table: SyncTable): Promise<string[]> {
  if (table === 'budgets') {
    return (await db.budgets.toArray()).map((b) => budgetDocId(b.categoryId, b.month));
  }
  return (await db[table].toCollection().primaryKeys()) as string[];
}

/**
 * 書いた（消した）記録を送れていない変更として積む。書き込みと同じトランザクションの中で呼び、
 * トランザクションの対象に db.outbox を含めること
 */
export async function markDirty(
  db: YarikuriDB,
  table: SyncTable,
  docIds: readonly string[],
): Promise<void> {
  await db.outbox.bulkPut(docIds.map((docId) => ({ table, docId, token: crypto.randomUUID() })));
}
