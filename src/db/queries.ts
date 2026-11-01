import Dexie from 'dexie';
import type { BalanceDelta } from '../domain/balance';
import { DEFAULT_MONTH_START_DAY, type PeriodRange } from '../domain/date';
import { APP_SETTINGS_ID, type Transaction } from '../domain/types';
import type { YarikuriDB } from './db';

/** 'YYYY-MM' の月の取引を date の索引で読む。存在しない日（31日など）は範囲の上限にだけ使う */
export function readMonthTransactions(db: YarikuriDB, month: string): Promise<Transaction[]> {
  return db.transactions.where('date').between(`${month}-01`, `${month}-31`, true, true).toArray();
}

/** 月の範囲（月の開始日による）の取引を date の索引で読む */
export function readPeriodTransactions(db: YarikuriDB, range: PeriodRange): Promise<Transaction[]> {
  return db.transactions.where('date').between(range.start, range.end, true, true).toArray();
}

/** 月の開始日。設定していなければ 1日 */
export async function readMonthStartDay(db: YarikuriDB): Promise<number> {
  return (await db.settings.get(APP_SETTINGS_ID))?.monthStartDay ?? DEFAULT_MONTH_START_DAY;
}

/** 口座の、すべての月の増減 */
export function readAccountDeltas(db: YarikuriDB, accountId: string): Promise<BalanceDelta[]> {
  return db.balanceDeltas
    .where('[accountId+month]')
    .between([accountId, Dexie.minKey], [accountId, Dexie.maxKey])
    .toArray();
}
