import Dexie from 'dexie';
import type { BalanceDelta } from '../domain/balance';
import type { Transaction } from '../domain/types';
import type { YarikuriDB } from './db';

/** 'YYYY-MM' の月の取引を date の索引で読む。存在しない日（31日など）は範囲の上限にだけ使う */
export function readMonthTransactions(db: YarikuriDB, month: string): Promise<Transaction[]> {
  return db.transactions.where('date').between(`${month}-01`, `${month}-31`, true, true).toArray();
}

/** 口座の、すべての月の増減 */
export function readAccountDeltas(db: YarikuriDB, accountId: string): Promise<BalanceDelta[]> {
  return db.balanceDeltas
    .where('[accountId+month]')
    .between([accountId, Dexie.minKey], [accountId, Dexie.maxKey])
    .toArray();
}
