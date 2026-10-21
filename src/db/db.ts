import Dexie, { type EntityTable, type Table } from 'dexie';
import type { Account, Budget, Category, Transaction } from '../domain/types';
import type { OutboxEntry, SyncTable } from '../sync/docs';

export type MetaKey =
  | 'seeded'
  | 'lastExportedAt'
  /** 同期しているアカウントの uid。初めてのサインインの処理を終えた端末だけが持つ */
  | 'syncUid'
  /** 最後に同期できた日時 */
  | 'lastSyncedAt'
  /** コレクションごとに、受け取った変更の最大の syncedAt（JSON） */
  | `syncCursor:${SyncTable}`;

export interface MetaEntry {
  key: MetaKey;
  value: string;
}

export class YarikuriDB extends Dexie {
  accounts!: EntityTable<Account, 'id'>;
  categories!: EntityTable<Category, 'id'>;
  transactions!: EntityTable<Transaction, 'id'>;
  meta!: EntityTable<MetaEntry, 'key'>;
  budgets!: Table<Budget, [string, string]>;
  outbox!: Table<OutboxEntry, [string, string]>;

  constructor(name = 'yarikuri') {
    super(name);
    const v1 = {
      accounts: 'id, type, sortOrder',
      categories: 'id, kind, sortOrder',
      transactions: 'id, date, accountId, toAccountId, categoryId',
      meta: 'key',
    };
    this.version(1).stores(v1);
    // 予算の設定記録。1カテゴリ1か月に1件
    const v2 = { ...v1, budgets: '[categoryId+month], categoryId' };
    this.version(2).stores(v2);
    // 他の端末へ送れていない変更。1記録に1件
    this.version(3).stores({ ...v2, outbox: '[table+docId]' });
  }
}

export const db = new YarikuriDB();
