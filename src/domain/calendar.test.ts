import { describe, expect, it } from 'vitest';
import { calendarWeeks, dailyTotals } from './calendar';
import { makeAccount, makeTx } from '../test/factories';

const wallet = makeAccount('財布', 'cash', 0);
const bank = makeAccount('A銀行', 'bank', 0);

describe('日ごとの出費・収入', () => {
  it('同じ日の出費と収入をそれぞれ足す', () => {
    const totals = dailyTotals([
      makeTx({ type: 'expense', date: '2026-10-05', amount: 800, accountId: wallet.id }),
      makeTx({ type: 'expense', date: '2026-10-05', amount: 1_200, accountId: wallet.id }),
      makeTx({ type: 'income', date: '2026-10-05', amount: 3_000, accountId: bank.id }),
      makeTx({ type: 'expense', date: '2026-10-06', amount: 500, accountId: wallet.id }),
    ]);
    expect(totals.get('2026-10-05')).toEqual({ expense: 2_000, income: 3_000 });
    expect(totals.get('2026-10-06')).toEqual({ expense: 500, income: 0 });
  });

  it('振替と残高調整は含めない', () => {
    const totals = dailyTotals([
      makeTx({
        type: 'transfer',
        date: '2026-10-05',
        amount: 10_000,
        accountId: bank.id,
        toAccountId: wallet.id,
      }),
      makeTx({ type: 'adjustment', date: '2026-10-05', amount: -300, accountId: wallet.id }),
    ]);
    expect(totals.has('2026-10-05')).toBe(false);
  });
});

describe('カレンダーの週の並び', () => {
  it('日曜始まりで、月の前後の枠は空ける', () => {
    const weeks = calendarWeeks('2026-10');
    expect(weeks).toHaveLength(5);
    // 2026-10-01 は木曜、10-31 は土曜
    expect(weeks[0]).toEqual([null, null, null, null, '2026-10-01', '2026-10-02', '2026-10-03']);
    expect(weeks[4][6]).toBe('2026-10-31');
    expect(weeks.every((w) => w.length === 7)).toBe(true);
  });

  it('日曜から始まる 28 日の月は 4 行に収まる', () => {
    const weeks = calendarWeeks('2026-02');
    expect(weeks).toHaveLength(4);
    expect(weeks[0][0]).toBe('2026-02-01');
    expect(weeks[3][6]).toBe('2026-02-28');
  });
});
