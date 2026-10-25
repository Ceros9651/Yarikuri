import Dexie, { type EntityTable, type Table, type Transaction as DexieTransaction } from 'dexie';
import { buildBalanceDeltas, type BalanceDelta } from '../domain/balance';
import type { Account, Budget, Category, Transaction } from '../domain/types';
import type { OutboxEntry, SyncTable } from '../sync/docs';
import { balanceDeltasMiddleware } from './balanceDeltas';

export type MetaKey =
  | 'seeded'
  | 'lastExportedAt'
  /** 同期しているアカウントの uid。初めてのサインインの処理を終えた端末だけが持つ */
  | 'syncUid'
  /** 最後に同期できた日時 */
  | 'lastSyncedAt'
  /** コレクションごとに、受け取った変更の最大の syncedAt（JSON） */
  | `syncCursor:${SyncTable}`;

export interface MetaEntry {
  key: MetaKey;
  value: string;
}

export class YarikuriDB extends Dexie {
  accounts!: EntityTable<Account, 'id'>;
  categories!: EntityTable<Category, 'id'>;
  transactions!: EntityTable<Transaction, 'id'>;
  meta!: EntityTable<MetaEntry, 'key'>;
  budgets!: Table<Budget, [string, string]>;
  outbox!: Table<OutboxEntry, [string, string]>;
  /** 口座×月の残高の増減。取引から作る端末の中だけの派生データで、同期・バックアップしない */
  balanceDeltas!: Table<BalanceDelta, [string, string]>;

  constructor(name = 'yarikuri') {
    super(name);
    const v1 = {
      accounts: 'id, type, sortOrder',
      categories: 'id, kind, sortOrder',
      transactions: 'id, date, accountId, toAccountId, categoryId',
      meta: 'key',
    };
    this.version(1).stores(v1);
    // 予算の設定記録。1カテゴリ1か月に1件
    const v2 = { ...v1, budgets: '[categoryId+month], categoryId' };
    this.version(2).stores(v2);
    // 他の端末へ送れていない変更。1記録に1件
    const v3 = { ...v2, outbox: '[table+docId]' };
    this.version(3).stores(v3);
    // 残高を全取引から足し直さずに求めるための、口座×月の増減。既存の取引から一度だけ作る
    this.version(4)
      .stores({ ...v3, balanceDeltas: '[accountId+month]' })
      .upgrade((tx) => fillBalanceDeltas(tx));
    this.use(balanceDeltasMiddleware);
  }
}

async function fillBalanceDeltas(tx: DexieTransaction): Promise<void> {
  const transactions = (await tx.table('transactions').toArray()) as Transaction[];
  await tx.table('balanceDeltas').clear();
  await tx.table('balanceDeltas').bulkAdd(buildBalanceDeltas(transactions));
}

/** 増減の表を全取引から作り直す。表が取引と食い違ったときの復旧用 */
export async function rebuildBalanceDeltas(db: YarikuriDB): Promise<void> {
  await db.transaction('rw', db.transactions, db.balanceDeltas, () =>
    fillBalanceDeltas(Dexie.currentTransaction),
  );
}

export const db = new YarikuriDB();
