import { describe, expect, it } from 'vitest';
import {
  canUseAccount,
  parseAmount,
  parseBalance,
  parseInitialBalance,
  validateName,
  validateTransaction,
  type TransactionDraft,
} from './validation';
import { makeAccount } from '../test/factories';

const wallet = makeAccount('財布', 'cash');
const bank = makeAccount('A銀行', 'bank');
const card = makeAccount('Aカード', 'credit');
const accounts = [wallet, bank, card];

const draft = (d: Partial<TransactionDraft>): TransactionDraft => ({
  type: 'expense',
  date: '2026-10-10',
  amount: '800',
  accountId: wallet.id,
  toAccountId: '',
  categoryId: 'cat',
  ...d,
});

describe('金額のチェック', () => {
  it.each(['0', '-1', '1.5', '', 'abc', '1000000000'])('「%s」は不正', (input) => {
    expect(parseAmount(input)).toBeNull();
  });

  it.each([
    ['1', 1],
    ['999999999', 999_999_999],
    ['1,200', 1_200],
  ])('「%s」は %d', (input, expected) => {
    expect(parseAmount(input)).toBe(expected);
  });

  it('不正な金額の取引はエラーになる', () => {
    expect(validateTransaction(draft({ amount: '0' }), accounts).amount).toBeDefined();
    expect(validateTransaction(draft({ amount: '800' }), accounts)).toEqual({});
  });

  it('残高調整の実際の残高は 0 や負の値も許可する', () => {
    expect(parseBalance('0')).toBe(0);
    expect(parseBalance('-300')).toBe(-300);
    expect(parseBalance('1.5')).toBeNull();
  });
});

describe('口座の選択肢', () => {
  it('クレジットカードは出費の支払元にだけ使える', () => {
    expect(canUseAccount('expense', 'from', card)).toBe(true);
    expect(canUseAccount('income', 'from', card)).toBe(false);
    expect(canUseAccount('transfer', 'from', card)).toBe(false);
    expect(canUseAccount('transfer', 'to', card)).toBe(false);
    expect(canUseAccount('adjustment', 'from', card)).toBe(false);
  });

  it('クレジットカードを入金先にした収入はエラーになる', () => {
    const errors = validateTransaction(draft({ type: 'income', accountId: card.id }), accounts);
    expect(errors.accountId).toBeDefined();
  });

  it('クレジットカードを振替先にした振替はエラーになる', () => {
    const errors = validateTransaction(
      draft({ type: 'transfer', accountId: bank.id, toAccountId: card.id, categoryId: '' }),
      accounts,
    );
    expect(errors.toAccountId).toBeDefined();
  });

  it('同じ口座どうしの振替はできない', () => {
    const errors = validateTransaction(
      draft({ type: 'transfer', accountId: bank.id, toAccountId: bank.id, categoryId: '' }),
      accounts,
    );
    expect(errors.toAccountId).toBe('振替元と異なる口座を選んでください');
  });

  it('正しい振替はエラーにならない', () => {
    const errors = validateTransaction(
      draft({ type: 'transfer', accountId: bank.id, toAccountId: wallet.id, categoryId: '' }),
      accounts,
    );
    expect(errors).toEqual({});
  });
});

describe('名前のチェック', () => {
  it('空の名前は登録できない', () => {
    expect(validateName('  ')).toBe('名前を入力してください');
  });

  it('重複した名前は登録できない', () => {
    expect(validateName('食費', ['食費', '日用品'])).toBe('同じ名前がすでにあります');
    expect(validateName('サブスク', ['食費', '日用品'])).toBeNull();
  });
});

describe('初期残高のチェック', () => {
  it('空欄は 0、0 以上の整数だけを許可する', () => {
    expect(parseInitialBalance('')).toBe(0);
    expect(parseInitialBalance('0')).toBe(0);
    expect(parseInitialBalance('120,000')).toBe(120_000);
    expect(parseInitialBalance('-1')).toBeNull();
    expect(parseInitialBalance('1.5')).toBeNull();
  });
});
