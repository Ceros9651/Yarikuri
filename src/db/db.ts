import Dexie, { type EntityTable, type Table } from 'dexie';
import type { Account, Budget, Category, Transaction } from '../domain/types';

export interface MetaEntry {
  key: 'seeded' | 'lastExportedAt';
  value: string;
}

export class YarikuriDB extends Dexie {
  accounts!: EntityTable<Account, 'id'>;
  categories!: EntityTable<Category, 'id'>;
  transactions!: EntityTable<Transaction, 'id'>;
  meta!: EntityTable<MetaEntry, 'key'>;
  budgets!: Table<Budget, [string, string]>;

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
    this.version(2).stores({ ...v1, budgets: '[categoryId+month], categoryId' });
  }
}

export const db = new YarikuriDB();
