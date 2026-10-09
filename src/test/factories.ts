import type { Account, AccountType, Category, Transaction } from '../domain/types';

let seq = 0;
const nextId = (prefix: string) => `${prefix}-${++seq}`;

export function makeAccount(
  name: string,
  type: AccountType = 'cash',
  initialBalance = 0,
  extra: Partial<Account> = {},
): Account {
  return {
    id: nextId('acc'),
    name,
    type,
    initialBalance: type === 'credit' ? 0 : initialBalance,
    hidden: false,
    sortOrder: seq,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...extra,
  };
}

export function makeCategory(
  name: string,
  kind: Category['kind'] = 'expense',
  extra: Partial<Category> = {},
): Category {
  return { id: nextId('cat'), kind, name, hidden: false, sortOrder: seq, ...extra };
}

export function makeTx(
  tx: Pick<Transaction, 'type' | 'amount' | 'accountId'> & Partial<Transaction>,
): Transaction {
  return {
    id: nextId('tx'),
    date: '2026-10-10',
    createdAt: '2026-10-10T00:00:00.000Z',
    updatedAt: '2026-10-10T00:00:00.000Z',
    ...tx,
  };
}
