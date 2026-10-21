import { describe, expect, it } from 'vitest';
import { isAfter, parseRemoteRecord } from './remote';

const tx = {
  id: 't1',
  type: 'expense',
  date: '2026-10-15',
  amount: 1200,
  accountId: 'a1',
  categoryId: 'c1',
  createdAt: '2026-10-15T00:00:00.000Z',
  updatedAt: '2026-10-15T00:00:00.000Z',
};

describe('parseRemoteRecord', () => {
  it('形式どおりの記録はそのまま受け取る', () => {
    expect(parseRemoteRecord('transactions', 't1', tx)).toEqual(tx);
    expect(
      parseRemoteRecord('budgets', 'c1__2026-10', {
        categoryId: 'c1',
        month: '2026-10',
        amount: null,
      }),
    ).toEqual({ categoryId: 'c1', month: '2026-10', amount: null });
  });

  it('形式が違う記録は捨てる', () => {
    expect(parseRemoteRecord('transactions', 't1', { ...tx, amount: '1200' })).toBeNull();
    expect(parseRemoteRecord('transactions', 't1', { ...tx, date: '10/15' })).toBeNull();
    expect(parseRemoteRecord('accounts', 'a1', { id: 'a1' })).toBeNull();
    expect(parseRemoteRecord('accounts', 'a1', null)).toBeNull();
    expect(parseRemoteRecord('accounts', 'a1', 'text')).toBeNull();
  });

  it('docId と中身の id が合わない記録は捨てる', () => {
    expect(parseRemoteRecord('transactions', 'other', tx)).toBeNull();
    expect(
      parseRemoteRecord('budgets', 'c1__2026-11', {
        categoryId: 'c1',
        month: '2026-10',
        amount: 1000,
      }),
    ).toBeNull();
  });
});

describe('isAfter', () => {
  it('秒・ナノ秒の順に比べ、基準がなければ常に後', () => {
    expect(isAfter({ seconds: 2, nanoseconds: 0 }, { seconds: 1, nanoseconds: 999 })).toBe(true);
    expect(isAfter({ seconds: 1, nanoseconds: 5 }, { seconds: 1, nanoseconds: 4 })).toBe(true);
    expect(isAfter({ seconds: 1, nanoseconds: 4 }, { seconds: 1, nanoseconds: 4 })).toBe(false);
    expect(isAfter({ seconds: 0, nanoseconds: 0 }, null)).toBe(true);
  });
});
