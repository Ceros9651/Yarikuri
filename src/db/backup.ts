import type { BackupData } from '../domain/backup';
import { APP_SETTINGS_ID } from '../domain/types';
import { allDocIds, markDirty, SYNC_TABLES } from '../sync/docs';
import { db as defaultDb, type YarikuriDB } from './db';
import { readMonthStartDay } from './queries';

export async function exportData(db: YarikuriDB = defaultDb): Promise<BackupData> {
  return db.transaction(
    'r',
    [db.accounts, db.categories, db.transactions, db.budgets, db.settings],
    async () => ({
      accounts: await db.accounts.orderBy('sortOrder').toArray(),
      categories: await db.categories.orderBy('sortOrder').toArray(),
      transactions: await db.transactions.orderBy('date').toArray(),
      budgets: await db.budgets.toArray(),
      settings: { monthStartDay: await readMonthStartDay(db) },
    }),
  );
}

/**
 * 口座・カテゴリ・取引・予算・設定をすべて置き換える。途中で失敗した場合は何も変わらない。
 * 置き換え前と後の全記録を送れていない変更として積むので、ファイルに無い記録は他の端末からも消える
 */
export async function importData(data: BackupData, db: YarikuriDB = defaultDb): Promise<void> {
  await db.transaction(
    'rw',
    [
      db.accounts,
      db.categories,
      db.transactions,
      db.budgets,
      db.settings,
      db.balanceDeltas,
      db.outbox,
    ],
    async () => {
      const before = await Promise.all(SYNC_TABLES.map((table) => allDocIds(db, table)));
      await Promise.all([
        db.accounts.clear(),
        db.categories.clear(),
        db.transactions.clear(),
        db.budgets.clear(),
        db.settings.clear(),
      ]);
      await db.accounts.bulkAdd(data.accounts);
      await db.categories.bulkAdd(data.categories);
      await db.transactions.bulkAdd(data.transactions);
      await db.budgets.bulkAdd(data.budgets);
      await db.settings.add({ id: APP_SETTINGS_ID, ...data.settings });
      for (const [i, table] of SYNC_TABLES.entries()) {
        const after = await allDocIds(db, table);
        await markDirty(db, table, [...new Set([...before[i], ...after])]);
      }
    },
  );
}

export async function setLastExportedAt(at: Date, db: YarikuriDB = defaultDb): Promise<void> {
  await db.meta.put({ key: 'lastExportedAt', value: at.toISOString() });
}
