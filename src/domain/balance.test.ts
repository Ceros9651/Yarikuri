import { describe, expect, it } from 'vitest';
import { computeAdjustmentAmount, computeBalance, computeBalances } from './balance';
import { makeAccount, makeTx } from '../test/factories';

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
    const amount = computeAdjustmentAmount(wallet, [], '2026-10-10', 5_000);
    expect(amount).toBe(-300);
    const adjustment = makeTx({ type: 'adjustment', amount, accountId: wallet.id });
    expect(computeBalance(wallet, [adjustment])).toBe(5_000);
  });

  it('調整を編集するときは調整自身を除いて差額を出し直す', () => {
    const wallet = makeAccount('財布', 'cash', 5_300);
    const adjustment = makeTx({ type: 'adjustment', amount: -300, accountId: wallet.id });
    const amount = computeAdjustmentAmount(
      wallet,
      [adjustment],
      '2026-10-10',
      4_800,
      adjustment.id,
    );
    expect(amount).toBe(-500);
  });

  it('調整日より後の取引は差額の計算に含めない', () => {
    const wallet = makeAccount('財布', 'cash', 5_300);
    const later = makeTx({
      type: 'expense',
      amount: 1_000,
      accountId: wallet.id,
      date: '2026-10-20',
    });
    expect(computeAdjustmentAmount(wallet, [later], '2026-10-10', 5_000)).toBe(-300);
  });
});
