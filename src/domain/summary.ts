import type { Account, Category, Transaction } from './types';

export interface CategoryBreakdown {
  categoryId: string;
  name: string;
  amount: number;
  /** 出費合計に対する割合（四捨五入した整数％） */
  percent: number;
}

export interface CardUsage {
  accountId: string;
  name: string;
  amount: number;
}

export interface MonthlySummary {
  income: number;
  expense: number;
  net: number;
  byCategory: CategoryBreakdown[];
  byCard: CardUsage[];
  cardTotal: number;
}

/** 'YYYY-MM' の月について集計する。振替と残高調整は含めない */
export function summarizeMonth(
  month: string,
  transactions: readonly Transaction[],
  accounts: readonly Account[],
  categories: readonly Category[],
): MonthlySummary {
  const accountById = new Map(accounts.map((a) => [a.id, a]));
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  let income = 0;
  let expense = 0;
  const categoryTotals = new Map<string, number>();
  const cardTotals = new Map<string, number>();

  for (const tx of transactions) {
    if (!tx.date.startsWith(`${month}-`)) continue;
    if (tx.type === 'income') {
      income += tx.amount;
    } else if (tx.type === 'expense') {
      expense += tx.amount;
      const categoryId = tx.categoryId ?? '';
      categoryTotals.set(categoryId, (categoryTotals.get(categoryId) ?? 0) + tx.amount);
      if (accountById.get(tx.accountId)?.type === 'credit') {
        cardTotals.set(tx.accountId, (cardTotals.get(tx.accountId) ?? 0) + tx.amount);
      }
    }
  }

  const byCategory = [...categoryTotals.entries()]
    .filter(([, amount]) => amount > 0)
    .map(([categoryId, amount]) => ({
      categoryId,
      name: categoryById.get(categoryId)?.name ?? '未分類',
      amount,
      percent: expense > 0 ? Math.round((amount / expense) * 100) : 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  const byCard = [...cardTotals.entries()]
    .map(([accountId, amount]) => ({
      accountId,
      name: accountById.get(accountId)?.name ?? '',
      amount,
    }))
    .sort(
      (a, b) =>
        (accountById.get(a.accountId)?.sortOrder ?? 0) -
        (accountById.get(b.accountId)?.sortOrder ?? 0),
    );
  const cardTotal = byCard.reduce((sum, c) => sum + c.amount, 0);

  return { income, expense, net: income - expense, byCategory, byCard, cardTotal };
}
