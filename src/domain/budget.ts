import { monthOf } from './date';
import { formatYen } from './format';
import { summarizeMonth } from './summary';
import type { Account, Budget, Category, Transaction } from './types';

export type BudgetStatus = 'normal' | 'warning' | 'over';

export const BUDGET_STATUS_LABELS: Record<BudgetStatus, string> = {
  normal: '',
  warning: '注意',
  over: '超過',
};

/**
 * カテゴリの、ある月の有効な予算を返す。予算なしなら null。
 * month 以前で最も新しい設定記録に従い、それが解除（amount: null）なら予算なし
 */
export function resolveBudget(
  categoryId: string,
  month: string,
  budgets: readonly Budget[],
): number | null {
  return findBudgetRecord(categoryId, month, budgets)?.amount ?? null;
}

/** month に効いている設定記録（month 以前で最も新しいもの）。なければ undefined */
export function findBudgetRecord(
  categoryId: string,
  month: string,
  budgets: readonly Budget[],
): Budget | undefined {
  let found: Budget | undefined;
  for (const b of budgets) {
    if (b.categoryId !== categoryId || b.month > month) continue;
    if (!found || b.month > found.month) found = b;
  }
  return found;
}

/** 80% 未満は通常、80% 以上かつ予算以下は注意、予算を超えたら超過 */
export function budgetStatus(spent: number, budget: number): BudgetStatus {
  if (spent > budget) return 'over';
  // 小数の丸め誤差を避けるため、spent / budget >= 0.8 を整数演算で判定する
  if (spent * 5 >= budget * 4) return 'warning';
  return 'normal';
}

export interface BudgetUsage {
  categoryId: string;
  name: string;
  spent: number;
  budget: number;
  /** 予算 − 出費。超過時は負の値 */
  remaining: number;
  /** 予算に対する割合（四捨五入した整数％。100 を超えることもある） */
  percent: number;
  status: BudgetStatus;
}

/** 選択月に予算がある表示中の出費カテゴリについて、消化状況をカテゴリの並び順で返す */
export function summarizeBudgets(
  month: string,
  transactions: readonly Transaction[],
  accounts: readonly Account[],
  categories: readonly Category[],
  budgets: readonly Budget[],
): BudgetUsage[] {
  const spentById = new Map(
    summarizeMonth(month, transactions, accounts, categories).byCategory.map((c) => [
      c.categoryId,
      c.amount,
    ]),
  );
  const usages: BudgetUsage[] = [];
  for (const category of [...categories].sort((a, b) => a.sortOrder - b.sortOrder)) {
    if (category.kind !== 'expense' || category.hidden) continue;
    const budget = resolveBudget(category.id, month, budgets);
    if (budget === null) continue;
    const spent = spentById.get(category.id) ?? 0;
    usages.push({
      categoryId: category.id,
      name: category.name,
      spent,
      budget,
      remaining: budget - spent,
      percent: Math.round((spent / budget) * 100),
      status: budgetStatus(spent, budget),
    });
  }
  return usages;
}

export interface BudgetAlert {
  status: Exclude<BudgetStatus, 'normal'>;
  message: string;
}

/** 出費の保存直後に出すメッセージ。取引の日付の月でそのカテゴリが注意・超過なら返す */
export function budgetAlertFor(
  tx: Transaction,
  transactions: readonly Transaction[],
  accounts: readonly Account[],
  categories: readonly Category[],
  budgets: readonly Budget[],
): BudgetAlert | null {
  if (tx.type !== 'expense' || !tx.categoryId) return null;
  const month = monthOf(tx.date);
  const budget = resolveBudget(tx.categoryId, month, budgets);
  if (budget === null) return null;
  const spent =
    summarizeMonth(month, transactions, accounts, categories).byCategory.find(
      (c) => c.categoryId === tx.categoryId,
    )?.amount ?? 0;
  const status = budgetStatus(spent, budget);
  if (status === 'normal') return null;
  const name = categories.find((c) => c.id === tx.categoryId)?.name ?? '';
  const amounts = `（${formatYen(spent)} / ${formatYen(budget)}）`;
  return {
    status,
    message:
      status === 'over'
        ? `${name}が予算を超過しました${amounts}`
        : `${name}が予算の80%に達しました${amounts}`,
  };
}
