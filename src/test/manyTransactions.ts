import { addMonths } from '../domain/date';
import type { Account, Category, Transaction, TransactionType } from '../domain/types';

/** 同じ seed なら同じ列を返す疑似乱数（mulberry32） */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface ManyTransactionsOptions {
  accounts: readonly Account[];
  categories: readonly Category[];
  /** 作る件数 */
  count: number;
  /** 最後の月 'YYYY-MM'。この月から months か月さかのぼって散らす */
  endMonth: string;
  months: number;
  seed?: number;
}

/**
 * 何年分もの取引を作る。収入・出費・振替・残高調整（負の値を含む）を混ぜ、
 * 月をまたいで複数の口座・カテゴリに散らす。クレジットカードは出費の支払元にだけ使う
 */
export function makeManyTransactions(options: ManyTransactionsOptions): Transaction[] {
  const { accounts, categories, count, endMonth, months, seed = 1 } = options;
  const random = seededRandom(seed);
  const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)];
  const assets = accounts.filter((a) => a.type !== 'credit');
  const expenseCategories = categories.filter((c) => c.kind === 'expense');
  const incomeCategories = categories.filter((c) => c.kind === 'income');
  const startMonth = addMonths(endMonth, -(months - 1));

  const transactions: Transaction[] = [];
  for (let i = 0; i < count; i++) {
    const month = addMonths(startMonth, Math.floor(random() * months));
    const date = `${month}-${String(1 + Math.floor(random() * 28)).padStart(2, '0')}`;
    const roll = random();
    const type: TransactionType =
      roll < 0.8 ? 'expense' : roll < 0.9 ? 'income' : roll < 0.97 ? 'transfer' : 'adjustment';
    const iso = `${date}T00:00:00.000Z`;
    const base = { id: `many-${seed}-${i}`, type, date, createdAt: iso, updatedAt: iso };
    switch (type) {
      case 'expense':
        transactions.push({
          ...base,
          amount: 100 + Math.floor(random() * 10_000),
          accountId: pick(accounts).id,
          // 一部はカテゴリのない出費にする
          categoryId: random() < 0.05 ? undefined : pick(expenseCategories)?.id,
        });
        break;
      case 'income':
        transactions.push({
          ...base,
          amount: 1_000 + Math.floor(random() * 300_000),
          accountId: pick(assets).id,
          categoryId: pick(incomeCategories)?.id,
        });
        break;
      case 'transfer': {
        const from = pick(assets);
        const to = pick(assets.filter((a) => a.id !== from.id)) ?? from;
        transactions.push({
          ...base,
          amount: 1_000 + Math.floor(random() * 50_000),
          accountId: from.id,
          toAccountId: to.id,
        });
        break;
      }
      case 'adjustment':
        transactions.push({
          ...base,
          amount: Math.floor(random() * 2_001) - 1_000,
          accountId: pick(assets).id,
        });
        break;
    }
  }
  return transactions;
}
