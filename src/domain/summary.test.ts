import { describe, expect, it } from 'vitest';
import { summarizeMonth } from './summary';
import { makeAccount, makeCategory, makeTx } from '../test/factories';

const wallet = makeAccount('財布', 'cash', 0);
const bank = makeAccount('A銀行', 'bank', 0);
const cardA = makeAccount('Aカード', 'credit');
const cardB = makeAccount('Bカード', 'credit');
const accounts = [wallet, bank, cardA, cardB];
const salary = makeCategory('給与', 'income');
const food = makeCategory('食費');
const daily = makeCategory('日用品');
const categories = [salary, food, daily];

describe('月の収入・出費・差額', () => {
  it('振替と残高調整を除いて集計する', () => {
    const txs = [
      makeTx({ type: 'income', amount: 250_000, accountId: bank.id, categoryId: salary.id }),
      makeTx({ type: 'expense', amount: 60_000, accountId: wallet.id, categoryId: food.id }),
      makeTx({ type: 'expense', amount: 20_000, accountId: cardA.id, categoryId: daily.id }),
      makeTx({ type: 'transfer', amount: 30_000, accountId: bank.id, toAccountId: wallet.id }),
      makeTx({ type: 'adjustment', amount: -500, accountId: wallet.id }),
    ];
    const s = summarizeMonth('2026-10', txs, accounts, categories);
    expect(s.income).toBe(250_000);
    expect(s.expense).toBe(80_000);
    expect(s.net).toBe(170_000);
  });

  it('暦月の範囲外の取引は含めない', () => {
    const txs = [
      makeTx({
        type: 'expense',
        amount: 100,
        accountId: wallet.id,
        categoryId: food.id,
        date: '2026-09-30',
      }),
      makeTx({
        type: 'expense',
        amount: 200,
        accountId: wallet.id,
        categoryId: food.id,
        date: '2026-10-01',
      }),
      makeTx({
        type: 'expense',
        amount: 400,
        accountId: wallet.id,
        categoryId: food.id,
        date: '2026-10-31',
      }),
      makeTx({
        type: 'expense',
        amount: 800,
        accountId: wallet.id,
        categoryId: food.id,
        date: '2026-11-01',
      }),
    ];
    expect(summarizeMonth('2026-10', txs, accounts, categories).expense).toBe(600);
    expect(summarizeMonth('2026-09', txs, accounts, categories).expense).toBe(100);
  });
});

describe('カテゴリ別内訳', () => {
  it('金額の大きい順に金額と割合を出す', () => {
    const txs = [
      makeTx({ type: 'expense', amount: 10_000, accountId: wallet.id, categoryId: daily.id }),
      makeTx({ type: 'expense', amount: 30_000, accountId: wallet.id, categoryId: food.id }),
    ];
    const s = summarizeMonth('2026-10', txs, accounts, categories);
    expect(s.byCategory).toEqual([
      { categoryId: food.id, name: '食費', amount: 30_000, percent: 75 },
      { categoryId: daily.id, name: '日用品', amount: 10_000, percent: 25 },
    ]);
  });

  it('非表示のカテゴリも名前で表示する', () => {
    const hidden = makeCategory('Amazon', 'expense', { hidden: true });
    const txs = [
      makeTx({ type: 'expense', amount: 1_000, accountId: wallet.id, categoryId: hidden.id }),
    ];
    const s = summarizeMonth('2026-10', txs, accounts, [...categories, hidden]);
    expect(s.byCategory[0].name).toBe('Amazon');
  });
});

describe('クレジットカード別の月利用額', () => {
  it('カードごとの利用額と合計を出す', () => {
    const txs = [
      makeTx({ type: 'expense', amount: 12_000, accountId: cardA.id, categoryId: food.id }),
      makeTx({ type: 'expense', amount: 3_000, accountId: cardB.id, categoryId: food.id }),
      makeTx({ type: 'expense', amount: 999, accountId: wallet.id, categoryId: food.id }),
    ];
    const s = summarizeMonth('2026-10', txs, accounts, categories);
    expect(s.byCard).toEqual([
      { accountId: cardA.id, name: 'Aカード', amount: 12_000 },
      { accountId: cardB.id, name: 'Bカード', amount: 3_000 },
    ]);
    expect(s.cardTotal).toBe(15_000);
  });

  it('非表示にしたカードでも過去の月の利用額が残る', () => {
    const hiddenCard = { ...cardA, hidden: true };
    const txs = [
      makeTx({
        type: 'expense',
        amount: 8_000,
        accountId: cardA.id,
        categoryId: food.id,
        date: '2026-09-05',
      }),
    ];
    const s = summarizeMonth('2026-09', txs, [hiddenCard, cardB], categories);
    expect(s.byCard).toEqual([{ accountId: cardA.id, name: 'Aカード', amount: 8_000 }]);
  });
});
