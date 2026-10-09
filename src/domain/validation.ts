import { isAssetAccount, type Account, type TransactionType } from './types';

export const MAX_AMOUNT = 999_999_999;

/** 金額欄の文字列を 1〜999,999,999 の整数に変換する。不正なら null */
export function parseAmount(input: string): number | null {
  const s = input.trim().replace(/,/g, '');
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  if (n < 1 || n > MAX_AMOUNT) return null;
  return n;
}

/** 残高調整の「実際の残高」欄。0 や負の値も許可する */
export function parseBalance(input: string): number | null {
  const s = input.trim().replace(/,/g, '');
  if (!/^-?\d+$/.test(s)) return null;
  const n = Number(s);
  if (Math.abs(n) > MAX_AMOUNT) return null;
  return n;
}

export interface TransactionDraft {
  type: TransactionType;
  date: string;
  /** adjustment では「実際の残高」 */
  amount: string;
  accountId: string;
  toAccountId: string;
  categoryId: string;
}

export type TransactionErrors = Partial<
  Record<'date' | 'amount' | 'accountId' | 'toAccountId' | 'categoryId', string>
>;

/** 取引の種類と役割（from: 入金先/支払元/振替元/調整対象、to: 振替先）ごとに口座を選べるか */
export function canUseAccount(
  type: TransactionType,
  role: 'from' | 'to',
  account: Pick<Account, 'type'>,
): boolean {
  if (type === 'expense') return role === 'from';
  if (type === 'transfer') return isAssetAccount(account);
  return role === 'from' && isAssetAccount(account);
}

export function validateTransaction(
  draft: TransactionDraft,
  accounts: readonly Account[],
): TransactionErrors {
  const errors: TransactionErrors = {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date)) errors.date = '日付を入力してください';

  if (draft.type === 'adjustment') {
    if (parseBalance(draft.amount) === null) errors.amount = '実際の残高を整数で入力してください';
  } else if (parseAmount(draft.amount) === null) {
    errors.amount = '金額は1〜999,999,999円の整数で入力してください';
  }

  const from = accounts.find((a) => a.id === draft.accountId);
  if (!from) {
    errors.accountId = '口座を選んでください';
  } else if (!canUseAccount(draft.type, 'from', from)) {
    errors.accountId = 'この口座は選べません';
  }

  if (draft.type === 'transfer') {
    const to = accounts.find((a) => a.id === draft.toAccountId);
    if (!to) {
      errors.toAccountId = '振替先を選んでください';
    } else if (!canUseAccount('transfer', 'to', to)) {
      errors.toAccountId = 'この口座は選べません';
    } else if (to.id === draft.accountId) {
      errors.toAccountId = '振替元と異なる口座を選んでください';
    }
  }

  if ((draft.type === 'income' || draft.type === 'expense') && !draft.categoryId) {
    errors.categoryId = 'カテゴリを選んでください';
  }
  return errors;
}

/** 口座・カテゴリの名前チェック。existingNames は重複を禁止する名前の一覧 */
export function validateName(name: string, existingNames: readonly string[] = []): string | null {
  const trimmed = name.trim();
  if (!trimmed) return '名前を入力してください';
  if (existingNames.includes(trimmed)) return '同じ名前がすでにあります';
  return null;
}

/** 口座の初期残高。空欄は 0、それ以外は 0〜999,999,999 の整数。不正なら null */
export function parseInitialBalance(input: string): number | null {
  const s = input.trim().replace(/,/g, '');
  if (s === '') return 0;
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return n > MAX_AMOUNT ? null : n;
}
