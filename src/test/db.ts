import { expect } from 'vitest';
import { db as defaultDb, type YarikuriDB } from '../db/db';
import { buildBalanceDeltas, type BalanceDelta } from '../domain/balance';
import type { Transaction } from '../domain/types';

/**
 * 入力画面を通さずに取引を直接入れる（カテゴリのない古いデータなど）。
 * 取引を書くトランザクションには増減の表を含める必要がある
 */
export async function putTransactions(
  transactions: readonly Transaction[],
  db: YarikuriDB = defaultDb,
): Promise<void> {
  await db.transaction('rw', db.transactions, db.balanceDeltas, () =>
    db.transactions.bulkPut([...transactions]),
  );
}

const byKey = (a: BalanceDelta, b: BalanceDelta) =>
  a.accountId.localeCompare(b.accountId) || a.month.localeCompare(b.month);

/**
 * 増減の表が、その時点の全取引から作った増減と一致することを確かめる。
 * 一致すれば、増減の表から求めた残高は全取引から求めた残高と同じになる
 */
export async function expectDeltasMatchTransactions(db: YarikuriDB = defaultDb): Promise<void> {
  const [transactions, deltas] = await Promise.all([
    db.transactions.toArray(),
    db.balanceDeltas.toArray(),
  ]);
  expect([...deltas].sort(byKey)).toEqual(buildBalanceDeltas(transactions).sort(byKey));
}
