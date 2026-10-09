import Dexie, { type EntityTable } from 'dexie';
import type { Account, Category, Transaction } from '../domain/types';

export interface MetaEntry {
  key: 'seeded' | 'lastExportedAt';
  value: string;
}

export class YarikuriDB extends Dexie {
  accounts!: EntityTable<Account, 'id'>;
  categories!: EntityTable<Category, 'id'>;
  transactions!: EntityTable<Transaction, 'id'>;
  meta!: EntityTable<MetaEntry, 'key'>;

  constructor(name = 'yarikuri') {
    super(name);
    this.version(1).stores({
      accounts: 'id, type, sortOrder',
      categories: 'id, kind, sortOrder',
      transactions: 'id, date, accountId, toAccountId, categoryId',
      meta: 'key',
    });
  }
}

export const db = new YarikuriDB();
