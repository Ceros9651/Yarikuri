import type { Account, Category, CategoryKind } from '../domain/types';
import { db as defaultDb, type YarikuriDB } from './db';

export const DEFAULT_EXPENSE_CATEGORIES = [
  '食費',
  '日用品',
  '交通費',
  '飲み会',
  '外食',
  '趣味・娯楽',
  'Amazon',
  '衣服',
  'その他',
];

export const DEFAULT_INCOME_CATEGORIES = ['給与', '賞与', '副業', '臨時収入', 'その他'];

function defaultCategories(kind: CategoryKind, names: string[]): Category[] {
  return names.map((name, i) => ({
    id: crypto.randomUUID(),
    kind,
    name,
    hidden: false,
    sortOrder: i,
  }));
}

/** 初回起動時だけ既定の「財布」口座と初期カテゴリを入れる。何度呼んでも重複しない */
export async function ensureSeeded(db: YarikuriDB = defaultDb): Promise<void> {
  await db.transaction('rw', db.accounts, db.categories, db.meta, async () => {
    if (await db.meta.get('seeded')) return;
    const wallet: Account = {
      id: crypto.randomUUID(),
      name: '財布',
      type: 'cash',
      initialBalance: 0,
      hidden: false,
      sortOrder: 0,
      createdAt: new Date().toISOString(),
    };
    if ((await db.accounts.count()) === 0) await db.accounts.add(wallet);
    if ((await db.categories.count()) === 0) {
      await db.categories.bulkAdd([
        ...defaultCategories('expense', DEFAULT_EXPENSE_CATEGORIES),
        ...defaultCategories('income', DEFAULT_INCOME_CATEGORIES),
      ]);
    }
    await db.meta.put({ key: 'seeded', value: new Date().toISOString() });
  });
}
