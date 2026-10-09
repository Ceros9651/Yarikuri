import { describe, expect, it } from 'vitest';
import { budgetAlertFor, budgetStatus, resolveBudget, summarizeBudgets } from './budget';
import type { Budget, Transaction } from './types';
import { makeAccount, makeCategory, makeTx } from '../test/factories';

const wallet = makeAccount('財布', 'cash', 0);
const bank = makeAccount('A銀行', 'bank', 0);
const accounts = [wallet, bank];
const food = makeCategory('食費');
const eatOut = makeCategory('外食');
const amazon = makeCategory('Amazon', 'expense', { hidden: true });
const salary = makeCategory('給与', 'income');
const categories = [food, eatOut, amazon, salary];

const spend = (categoryId: string, amount: number, date = '2026-10-10') =>
  makeTx({ type: 'expense', amount, accountId: wallet.id, categoryId, date });

describe('予算の引き継ぎ', () => {
  it('前の月の予算を引き継ぐ', () => {
    const budgets: Budget[] = [{ categoryId: food.id, month: '2026-10', amount: 40_000 }];
    expect(resolveBudget(food.id, '2026-10', budgets)).toBe(40_000);
    expect(resolveBudget(food.id, '2026-11', budgets)).toBe(40_000);
    expect(resolveBudget(food.id, '2026-12', budgets)).toBe(40_000);
  });

  it('特定の月だけ上書きする', () => {
    const budgets: Budget[] = [
      { categoryId: food.id, month: '2026-12', amount: 50_000 },
      { categoryId: food.id, month: '2026-10', amount: 40_000 },
    ];
    expect(resolveBudget(food.id, '2026-10', budgets)).toBe(40_000);
    expect(resolveBudget(food.id, '2026-11', budgets)).toBe(40_000);
    expect(resolveBudget(food.id, '2026-12', budgets)).toBe(50_000);
    expect(resolveBudget(food.id, '2027-03', budgets)).toBe(50_000);
  });

  it('解除も引き継がれる', () => {
    const budgets: Budget[] = [
      { categoryId: eatOut.id, month: '2026-10', amount: 10_000 },
      { categoryId: eatOut.id, month: '2026-11', amount: null },
    ];
    expect(resolveBudget(eatOut.id, '2026-10', budgets)).toBe(10_000);
    expect(resolveBudget(eatOut.id, '2026-11', budgets)).toBeNull();
    expect(resolveBudget(eatOut.id, '2027-01', budgets)).toBeNull();
  });

  it('最初の設定より前の月は予算なし', () => {
    const budgets: Budget[] = [{ categoryId: food.id, month: '2026-10', amount: 40_000 }];
    expect(resolveBudget(food.id, '2026-09', budgets)).toBeNull();
  });

  it('他のカテゴリの設定は使わない', () => {
    const budgets: Budget[] = [{ categoryId: food.id, month: '2026-10', amount: 40_000 }];
    expect(resolveBudget(eatOut.id, '2026-10', budgets)).toBeNull();
  });
});

describe('予算の状態の判定', () => {
  it.each([
    [31_999, 'normal'],
    [32_000, 'warning'],
    [40_000, 'warning'],
    [40_001, 'over'],
  ] as const)('予算 40,000 円で出費 %i 円は %s', (spent, status) => {
    expect(budgetStatus(spent, 40_000)).toBe(status);
  });
});

describe('予算の消化状況', () => {
  const budgets: Budget[] = [
    { categoryId: food.id, month: '2026-10', amount: 40_000 },
    { categoryId: eatOut.id, month: '2026-10', amount: 10_000 },
    { categoryId: amazon.id, month: '2026-10', amount: 5_000 },
  ];

  it('出費 0 円のカテゴリも予算があれば含める', () => {
    const usages = summarizeBudgets(
      '2026-10',
      [spend(food.id, 30_000)],
      accounts,
      categories,
      budgets,
    );
    expect(usages).toEqual([
      {
        categoryId: food.id,
        name: '食費',
        spent: 30_000,
        budget: 40_000,
        remaining: 10_000,
        percent: 75,
        status: 'normal',
      },
      {
        categoryId: eatOut.id,
        name: '外食',
        spent: 0,
        budget: 10_000,
        remaining: 10_000,
        percent: 0,
        status: 'normal',
      },
    ]);
  });

  it('超過したカテゴリは超過額を負の残りで返す', () => {
    const usages = summarizeBudgets(
      '2026-10',
      [spend(eatOut.id, 12_500)],
      accounts,
      categories,
      budgets,
    );
    expect(usages.find((u) => u.categoryId === eatOut.id)).toMatchObject({
      spent: 12_500,
      remaining: -2_500,
      percent: 125,
      status: 'over',
    });
  });

  it('非表示のカテゴリと予算のないカテゴリは含めない', () => {
    const usages = summarizeBudgets(
      '2026-10',
      [spend(amazon.id, 9_000)],
      accounts,
      categories,
      budgets,
    );
    expect(usages.map((u) => u.name)).toEqual(['食費', '外食']);
  });

  it('予算の設定前の月は空', () => {
    expect(summarizeBudgets('2026-09', [], accounts, categories, budgets)).toEqual([]);
  });
});

describe('出費保存時のアラート', () => {
  const budgets: Budget[] = [
    { categoryId: food.id, month: '2026-10', amount: 40_000 },
    { categoryId: eatOut.id, month: '2026-09', amount: 10_000 },
  ];
  const alertFor = (tx: Transaction, others: Transaction[]) =>
    budgetAlertFor(tx, [...others, tx], accounts, categories, budgets);

  it('保存で予算を超えたら知らせる', () => {
    const alert = alertFor(spend(eatOut.id, 3_000), [spend(eatOut.id, 8_000)]);
    expect(alert).toEqual({
      status: 'over',
      message: '外食が予算を超過しました（¥11,000 / ¥10,000）',
    });
  });

  it('注意に入ったら知らせる', () => {
    const alert = alertFor(spend(food.id, 3_000), [spend(food.id, 30_000)]);
    expect(alert).toEqual({
      status: 'warning',
      message: '食費が予算の80%に達しました（¥33,000 / ¥40,000）',
    });
  });

  it('予算内なら知らせない', () => {
    expect(alertFor(spend(food.id, 2_000), [spend(food.id, 10_000)])).toBeNull();
  });

  it('取引の日付の月で判定する', () => {
    const september = spend(eatOut.id, 20_000, '2026-09-15');
    expect(alertFor(spend(eatOut.id, 1_000), [september])).toBeNull();
  });

  it('収入・振替・残高調整では知らせない', () => {
    const over = [spend(food.id, 50_000)];
    const txs = [
      makeTx({ type: 'income', amount: 1, accountId: wallet.id, categoryId: salary.id }),
      makeTx({ type: 'transfer', amount: 1, accountId: bank.id, toAccountId: wallet.id }),
      makeTx({ type: 'adjustment', amount: -1, accountId: wallet.id }),
    ];
    for (const tx of txs) expect(alertFor(tx, over)).toBeNull();
  });

  it('予算のないカテゴリでは知らせない', () => {
    const other = makeCategory('日用品');
    const tx = spend(other.id, 99_999);
    expect(budgetAlertFor(tx, [tx], accounts, [...categories, other], budgets)).toBeNull();
  });
});
