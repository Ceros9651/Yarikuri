import { describe, expect, it } from 'vitest';
import {
  balanceAsOf,
  balancesAtMonthEnd,
  buildBalanceDeltas,
  computeAdjustmentAmount,
  computeBalance,
  computeBalances,
} from './balance';
import { addMonths, lastDayOfMonth } from './date';
import { makeAccount, makeCategory, makeTx } from '../test/factories';
import { makeManyTransactions, seededRandom } from '../test/manyTransactions';

describe('現金・銀行・電子マネーの残高算出', () => {
  it('初期残高だけの口座はその額になる', () => {
    const bank = makeAccount('A銀行', 'bank', 120_000);
    expect(computeBalance(bank, [])).toBe(120_000);
  });

  it('収入と出費が残高に反映される', () => {
    const wallet = makeAccount('財布', 'cash', 10_000);
    const txs = [
      makeTx({ type: 'income', amount: 3_000, accountId: wallet.id }),
      makeTx({ type: 'expense', amount: 1_200, accountId: wallet.id }),
    ];
    expect(computeBalance(wallet, txs)).toBe(11_800);
  });

  it('振替が両方の口座に反映される', () => {
    const bank = makeAccount('A銀行', 'bank', 50_000);
    const wallet = makeAccount('財布', 'cash', 2_000);
    const txs = [
      makeTx({ type: 'transfer', amount: 10_000, accountId: bank.id, toAccountId: wallet.id }),
    ];
    const balances = computeBalances([bank, wallet], txs);
    expect(balances.get(bank.id)).toBe(40_000);
    expect(balances.get(wallet.id)).toBe(12_000);
  });

  it('残高は負の値になってもよい', () => {
    const wallet = makeAccount('財布', 'cash', 100);
    const txs = [makeTx({ type: 'expense', amount: 500, accountId: wallet.id })];
    expect(computeBalance(wallet, txs)).toBe(-400);
  });

  it('初期残高の変更が残高に反映される', () => {
    const bank = makeAccount('A銀行', 'bank', 120_000);
    const txs = [makeTx({ type: 'expense', amount: 1_000, accountId: bank.id })];
    const before = computeBalance(bank, txs)!;
    const after = computeBalance({ ...bank, initialBalance: 100_000 }, txs)!;
    expect(before - after).toBe(20_000);
  });
});

describe('クレジットカードは残高を持たない', () => {
  it('カード払いは口座残高に影響しない', () => {
    const wallet = makeAccount('財布', 'cash', 10_000);
    const bank = makeAccount('A銀行', 'bank', 50_000);
    const card = makeAccount('Aカード', 'credit');
    const txs = [makeTx({ type: 'expense', amount: 5_000, accountId: card.id })];
    const balances = computeBalances([wallet, bank, card], txs);
    expect(balances.get(wallet.id)).toBe(10_000);
    expect(balances.get(bank.id)).toBe(50_000);
    expect(balances.has(card.id)).toBe(false);
    expect(computeBalance(card, txs)).toBeNull();
  });
});

describe('基準日つきの残高', () => {
  it('過去の月末時点の残高は翌月の取引を含まない', () => {
    const wallet = makeAccount('財布', 'cash', 1_000);
    const txs = [
      makeTx({ type: 'income', amount: 2_000, accountId: wallet.id, date: '2026-09-15' }),
      makeTx({ type: 'income', amount: 5_000, accountId: wallet.id, date: '2026-10-01' }),
    ];
    expect(computeBalance(wallet, txs, '2026-09-30')).toBe(3_000);
    expect(computeBalance(wallet, txs, '2026-10-31')).toBe(8_000);
  });
});

describe('残高調整の差額', () => {
  it('財布の残高を実際に合わせる', () => {
    const wallet = makeAccount('財布', 'cash', 5_300);
    const amount = computeAdjustmentAmount(wallet, [], [], '2026-10-10', 5_000);
    expect(amount).toBe(-300);
    const adjustment = makeTx({ type: 'adjustment', amount, accountId: wallet.id });
    expect(computeBalance(wallet, [adjustment])).toBe(5_000);
  });

  it('調整を編集するときは調整自身を除いて差額を出し直す', () => {
    const wallet = makeAccount('財布', 'cash', 5_300);
    const adjustment = makeTx({ type: 'adjustment', amount: -300, accountId: wallet.id });
    const deltas = buildBalanceDeltas([adjustment]);
    const amount = computeAdjustmentAmount(
      wallet,
      deltas,
      [adjustment],
      '2026-10-10',
      4_800,
      adjustment,
    );
    expect(amount).toBe(-500);
  });

  it('前の月の調整を今月に移す編集でも、調整自身を除いて差額を出し直す', () => {
    const wallet = makeAccount('財布', 'cash', 5_300);
    const adjustment = makeTx({
      type: 'adjustment',
      amount: -300,
      accountId: wallet.id,
      date: '2026-09-20',
    });
    const deltas = buildBalanceDeltas([adjustment]);
    expect(computeAdjustmentAmount(wallet, deltas, [], '2026-10-10', 4_800, adjustment)).toBe(-500);
  });

  it('調整日より後の取引は差額の計算に含めない', () => {
    const wallet = makeAccount('財布', 'cash', 5_300);
    const later = makeTx({
      type: 'expense',
      amount: 1_000,
      accountId: wallet.id,
      date: '2026-10-20',
    });
    expect(
      computeAdjustmentAmount(wallet, buildBalanceDeltas([later]), [later], '2026-10-10', 5_000),
    ).toBe(-300);
  });
});

describe('口座×月の増減からの残高', () => {
  const wallet = makeAccount('財布', 'cash', 15_000);
  const bank = makeAccount('A銀行', 'bank', 320_000);
  const suica = makeAccount('Suica', 'emoney', 2_400);
  const card = makeAccount('Aカード', 'credit');
  const accounts = [wallet, bank, suica, card];
  const categories = [makeCategory('食費'), makeCategory('外食'), makeCategory('給与', 'income')];
  const transactions = makeManyTransactions({
    accounts,
    categories,
    count: 3_000,
    endMonth: '2026-10',
    months: 36,
    seed: 7,
  });
  const deltas = buildBalanceDeltas(transactions);

  it('作ったデータには月をまたぐ振替・負の残高調整・カード払いが含まれる', () => {
    expect(transactions.some((t) => t.type === 'transfer' && t.toAccountId !== t.accountId)).toBe(
      true,
    );
    expect(transactions.some((t) => t.type === 'adjustment' && t.amount < 0)).toBe(true);
    expect(transactions.some((t) => t.type === 'expense' && t.accountId === card.id)).toBe(true);
    expect(deltas.every((d) => d.delta !== 0)).toBe(true);
  });

  it('各月末の残高が全件から求めた残高と一致する', () => {
    // 記録の前後の月も含める
    for (let i = -2; i < 38; i++) {
      const month = addMonths('2023-11', i);
      expect(balancesAtMonthEnd(accounts, deltas, month)).toEqual(
        computeBalances(accounts, transactions, lastDayOfMonth(month)),
      );
    }
  });

  it('任意の日付・除外する取引で全件から求めた残高と一致する', () => {
    const random = seededRandom(3);
    for (let i = 0; i < 300; i++) {
      const account = accounts[Math.floor(random() * accounts.length)];
      const month = addMonths('2023-10', Math.floor(random() * 40));
      const date = `${month}-${String(1 + Math.floor(random() * 31)).padStart(2, '0')}`;
      const exclude =
        random() < 0.5 ? transactions[Math.floor(random() * transactions.length)] : undefined;
      const monthTransactions = transactions.filter((t) => t.date.startsWith(`${month}-`));
      expect(balanceAsOf(account, deltas, monthTransactions, date, exclude)).toBe(
        computeBalance(account, transactions, date, exclude?.id),
      );
    }
  });

  it('クレジットカードは残高を持たない', () => {
    expect(balanceAsOf(card, deltas, [], '2026-10-10')).toBeNull();
    expect(balancesAtMonthEnd(accounts, deltas, '2026-10').has(card.id)).toBe(false);
  });

  it('同じ口座への振替は増減を生まない', () => {
    const self = makeTx({
      type: 'transfer',
      amount: 1_000,
      accountId: wallet.id,
      toAccountId: wallet.id,
    });
    expect(buildBalanceDeltas([self])).toEqual([]);
  });
});
