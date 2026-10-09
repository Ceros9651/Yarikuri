import { isAssetAccount, type Account, type Transaction } from './types';

/** 取引がその口座の残高をいくら動かすか */
export function balanceDelta(tx: Transaction, accountId: string): number {
  switch (tx.type) {
    case 'income':
    case 'adjustment':
      return tx.accountId === accountId ? tx.amount : 0;
    case 'expense':
      return tx.accountId === accountId ? -tx.amount : 0;
    case 'transfer':
      return (
        (tx.toAccountId === accountId ? tx.amount : 0) -
        (tx.accountId === accountId ? tx.amount : 0)
      );
  }
}

/**
 * 口座の残高を算出する。asOf（'YYYY-MM-DD'、その日を含む）を渡すとその日までの取引だけを使う。
 * クレジットカードは残高を持たないので null を返す。
 */
export function computeBalance(
  account: Account,
  transactions: readonly Transaction[],
  asOf?: string,
  excludeTransactionId?: string,
): number | null {
  if (!isAssetAccount(account)) return null;
  let balance = account.initialBalance;
  for (const tx of transactions) {
    if (asOf !== undefined && tx.date > asOf) continue;
    if (tx.id === excludeTransactionId) continue;
    balance += balanceDelta(tx, account.id);
  }
  return balance;
}

/** 現金・銀行・電子マネー口座の残高を id ごとに返す */
export function computeBalances(
  accounts: readonly Account[],
  transactions: readonly Transaction[],
  asOf?: string,
): Map<string, number> {
  const result = new Map<string, number>();
  for (const account of accounts) {
    const balance = computeBalance(account, transactions, asOf);
    if (balance !== null) result.set(account.id, balance);
  }
  return result;
}

/** 残高調整で保存する差額。調整日までの算出残高（編集中の調整自身は除く）と実際の残高の差 */
export function computeAdjustmentAmount(
  account: Account,
  transactions: readonly Transaction[],
  date: string,
  actualBalance: number,
  excludeTransactionId?: string,
): number {
  const current = computeBalance(account, transactions, date, excludeTransactionId);
  if (current === null) throw new Error('クレジットカードは残高調整できません');
  return actualBalance - current;
}
