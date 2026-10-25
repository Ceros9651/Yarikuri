import { monthOf } from './date';
import { isAssetAccount, type Account, type Transaction } from './types';

/**
 * 口座のある月の取引が残高を動かした合計（初期残高は含めない）。
 * 端末の中だけの派生データで、取引の表への書き込みと同時に更新される
 */
export interface BalanceDelta {
  accountId: string;
  /** 'YYYY-MM' */
  month: string;
  delta: number;
}

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

/** 取引が動かす口座ごとの増減。振替は振替元と振替先の2件になる */
export function transactionDeltas(tx: Transaction): BalanceDelta[] {
  const month = monthOf(tx.date);
  const accountIds = [...new Set([tx.accountId, tx.toAccountId ?? tx.accountId])];
  return accountIds
    .map((accountId) => ({ accountId, month, delta: balanceDelta(tx, accountId) }))
    .filter((d) => d.delta !== 0);
}

/** 取引の列から口座×月の増減を作る。合計が 0 の組は含めない */
export function buildBalanceDeltas(transactions: readonly Transaction[]): BalanceDelta[] {
  const sums = new Map<string, BalanceDelta>();
  for (const tx of transactions) {
    for (const d of transactionDeltas(tx)) {
      const key = `${d.accountId}\u0000${d.month}`;
      const sum = sums.get(key);
      if (sum) sum.delta += d.delta;
      else sums.set(key, { ...d });
    }
  }
  return [...sums.values()].filter((d) => d.delta !== 0);
}

/**
 * 月末時点の現金・銀行・電子マネー口座の残高を id ごとに返す。
 * computeBalances(accounts, 全取引, lastDayOfMonth(month)) と同じ値になる
 */
export function balancesAtMonthEnd(
  accounts: readonly Account[],
  deltas: readonly BalanceDelta[],
  month: string,
): Map<string, number> {
  const result = new Map<string, number>();
  for (const account of accounts) {
    if (isAssetAccount(account)) result.set(account.id, account.initialBalance);
  }
  for (const d of deltas) {
    const balance = result.get(d.accountId);
    if (balance !== undefined && d.month <= month) result.set(d.accountId, balance + d.delta);
  }
  return result;
}

/**
 * date（その日を含む）時点の口座の残高。monthTransactions には date の月の取引を渡す。
 * exclude には計算から除く保存済みの取引（編集中の残高調整）を渡す。
 * computeBalance(account, 全取引, date, exclude?.id) と同じ値になる
 */
export function balanceAsOf(
  account: Account,
  deltas: readonly BalanceDelta[],
  monthTransactions: readonly Transaction[],
  date: string,
  exclude?: Transaction,
): number | null {
  if (!isAssetAccount(account)) return null;
  const month = monthOf(date);
  let balance = account.initialBalance;
  for (const d of deltas) {
    if (d.accountId === account.id && d.month < month) balance += d.delta;
  }
  // 前の月にある除外する取引は、増減の合計に含まれているので引き戻す
  if (exclude && monthOf(exclude.date) < month) balance -= balanceDelta(exclude, account.id);
  for (const tx of monthTransactions) {
    if (monthOf(tx.date) !== month || tx.date > date) continue;
    if (tx.id === exclude?.id) continue;
    balance += balanceDelta(tx, account.id);
  }
  return balance;
}

/**
 * 残高調整で保存する差額。調整日までの算出残高（編集中の調整自身は除く）と実際の残高の差。
 * deltas・monthTransactions・exclude は balanceAsOf と同じ
 */
export function computeAdjustmentAmount(
  account: Account,
  deltas: readonly BalanceDelta[],
  monthTransactions: readonly Transaction[],
  date: string,
  actualBalance: number,
  exclude?: Transaction,
): number {
  const current = balanceAsOf(account, deltas, monthTransactions, date, exclude);
  if (current === null) throw new Error('クレジットカードは残高調整できません');
  return actualBalance - current;
}
