import type { BackupData } from '../domain/backup';
import { db as defaultDb, type YarikuriDB } from './db';

export async function exportData(db: YarikuriDB = defaultDb): Promise<BackupData> {
  return db.transaction('r', db.accounts, db.categories, db.transactions, db.budgets, async () => ({
    accounts: await db.accounts.orderBy('sortOrder').toArray(),
    categories: await db.categories.orderBy('sortOrder').toArray(),
    transactions: await db.transactions.orderBy('date').toArray(),
    budgets: await db.budgets.toArray(),
  }));
}

/** 口座・カテゴリ・取引・予算をすべて置き換える。途中で失敗した場合は何も変わらない */
export async function importData(data: BackupData, db: YarikuriDB = defaultDb): Promise<void> {
  await db.transaction(
    'rw',
    [db.accounts, db.categories, db.transactions, db.budgets],
    async () => {
      await Promise.all([
        db.accounts.clear(),
        db.categories.clear(),
        db.transactions.clear(),
        db.budgets.clear(),
      ]);
      await db.accounts.bulkAdd(data.accounts);
      await db.categories.bulkAdd(data.categories);
      await db.transactions.bulkAdd(data.transactions);
      await db.budgets.bulkAdd(data.budgets);
    },
  );
}

export async function setLastExportedAt(at: Date, db: YarikuriDB = defaultDb): Promise<void> {
  await db.meta.put({ key: 'lastExportedAt', value: at.toISOString() });
}
