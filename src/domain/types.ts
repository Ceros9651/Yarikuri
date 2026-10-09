export type AccountType = 'cash' | 'bank' | 'emoney' | 'credit';

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  /** 現金・銀行・電子マネーの初期残高。クレジットカードは常に 0 で使わない */
  initialBalance: number;
  hidden: boolean;
  sortOrder: number;
  createdAt: string;
}

export type CategoryKind = 'income' | 'expense';

export interface Category {
  id: string;
  kind: CategoryKind;
  name: string;
  hidden: boolean;
  sortOrder: number;
}

export type TransactionType = 'income' | 'expense' | 'transfer' | 'adjustment';

export interface Transaction {
  id: string;
  type: TransactionType;
  /** 端末ローカルの日付 'YYYY-MM-DD' */
  date: string;
  /** income/expense/transfer は正の整数、adjustment のみ符号付きの差額 */
  amount: number;
  /** income: 入金先, expense: 支払元, transfer: 振替元, adjustment: 対象口座 */
  accountId: string;
  /** transfer の振替先 */
  toAccountId?: string;
  /** income/expense のカテゴリ */
  categoryId?: string;
  memo?: string;
  createdAt: string;
  updatedAt: string;
}

export const ACCOUNT_TYPES: readonly AccountType[] = ['cash', 'bank', 'emoney', 'credit'];

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  cash: '現金',
  bank: '銀行',
  emoney: '電子マネー',
  credit: 'クレジットカード',
};

export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  income: '収入',
  expense: '出費',
  transfer: '振替',
  adjustment: '残高調整',
};

/** 残高を持つ口座（現金・銀行・電子マネー）かどうか */
export function isAssetAccount(account: Pick<Account, 'type'>): boolean {
  return account.type !== 'credit';
}
