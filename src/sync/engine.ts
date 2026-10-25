import { liveQuery } from 'dexie';
import type { YarikuriDB } from '../db/db';
import {
  deleteRecord,
  docIdOf,
  putRecord,
  readRecord,
  SYNC_TABLES,
  type OutboxEntry,
  type SyncRecord,
  type SyncTable,
} from './docs';
import {
  isAfter,
  MAX_WRITE,
  parseRemoteRecord,
  SyncError,
  type Cursor,
  type OutgoingDoc,
  type RemoteDoc,
  type SyncRemote,
} from './remote';

// ---- 同期の記録（meta） ----

const cursorKey = (table: SyncTable) => `syncCursor:${table}` as const;

export async function readCursor(db: YarikuriDB, table: SyncTable): Promise<Cursor | null> {
  const entry = await db.meta.get(cursorKey(table));
  return entry ? (JSON.parse(entry.value) as Cursor) : null;
}

async function writeCursor(db: YarikuriDB, table: SyncTable, cursor: Cursor | null) {
  if (cursor) await db.meta.put({ key: cursorKey(table), value: JSON.stringify(cursor) });
  else await db.meta.delete(cursorKey(table));
}

async function touchLastSyncedAt(db: YarikuriDB) {
  await db.meta.put({ key: 'lastSyncedAt', value: new Date().toISOString() });
}

export async function getSyncUid(db: YarikuriDB): Promise<string | undefined> {
  return (await db.meta.get('syncUid'))?.value;
}

/** サインアウトしたときに同期の記録を消す。端末の記録と outbox は残す */
export async function clearSyncState(db: YarikuriDB): Promise<void> {
  await db.meta.bulkDelete(['syncUid', 'lastSyncedAt', ...SYNC_TABLES.map(cursorKey)]);
}

export function toSyncError(e: unknown): SyncError {
  if (e instanceof SyncError) return e;
  return new SyncError('other', e instanceof Error ? e.message : String(e));
}

function chunks<T>(items: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
  return result;
}

const syncTables = (db: YarikuriDB) => SYNC_TABLES.map((t) => db.table(t));

// ---- 送受信 ----

export interface EngineState {
  /** 送信中、または最初の受信を待っている */
  busy: boolean;
  error: SyncError | null;
  /** 形式が読めず取り込まなかった記録の数 */
  invalidRecords: number;
}

/**
 * サインインしている端末の送受信。Dexie の outbox を送り、クラウドの変更を Dexie に書く。
 * 端末に未送信の変更がある記録は、クラウドから届いた変更より端末の変更を優先して送る（後勝ち）
 */
export class SyncEngine {
  private stopped = true;
  private cleanups: (() => void)[] = [];
  private pushing: Promise<void> | null = null;
  private pushAgain = false;
  private applying: Promise<void> = Promise.resolve();
  private waitingFirst = new Set<SyncTable>();
  private state: EngineState = { busy: false, error: null, invalidRecords: 0 };

  constructor(
    private readonly db: YarikuriDB,
    private readonly remote: SyncRemote,
    private readonly onState: (state: EngineState) => void = () => {},
  ) {}

  async start(): Promise<void> {
    this.stopped = false;
    this.waitingFirst = new Set(SYNC_TABLES);
    this.emit();
    for (const table of SYNC_TABLES) {
      const cursor = await readCursor(this.db, table);
      if (this.stopped) return;
      this.cleanups.push(
        this.remote.subscribe(
          table,
          cursor,
          (docs, fromServer) => this.enqueueApply(table, docs, fromServer),
          (error) => this.fail(error),
        ),
      );
    }
    // 書き込みで outbox が増えたら送る。開始時の通知で、前回送れなかった分も送る
    const subscription = liveQuery(() => this.db.outbox.count()).subscribe({
      next: (count) => {
        if (count > 0) void this.push();
      },
      error: (e: unknown) => this.fail(toSyncError(e)),
    });
    this.cleanups.push(() => subscription.unsubscribe());
    const onOnline = () => void this.push();
    window.addEventListener('online', onOnline);
    this.cleanups.push(() => window.removeEventListener('online', onOnline));
  }

  stop(): void {
    this.stopped = true;
    this.cleanups.forEach((cleanup) => cleanup());
    this.cleanups = [];
  }

  /** outbox を送る。同時には1つだけ動かし、送信中に増えた分は続けて送る */
  push(): Promise<void> {
    if (this.stopped) return Promise.resolve();
    if (this.pushing) {
      this.pushAgain = true;
      return this.pushing;
    }
    this.pushing = (async () => {
      try {
        do {
          this.pushAgain = false;
          await this.pushOnce();
        } while (this.pushAgain && !this.stopped);
      } catch (e) {
        this.fail(toSyncError(e));
      } finally {
        this.pushing = null;
        this.emit();
      }
    })();
    this.emit();
    return this.pushing;
  }

  /** テスト用。送信と受信の書き込みが落ち着くまで待つ */
  async settle(): Promise<void> {
    for (let i = 0; i < 20; i++) {
      const pushing = this.pushing;
      const applying = this.applying;
      await Promise.all([pushing, applying]);
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (pushing === this.pushing && applying === this.applying && !this.pushing) return;
    }
  }

  private async pushOnce(): Promise<void> {
    const entries = await this.db.outbox.toArray();
    if (entries.length === 0) return;
    for (const chunk of chunks(entries, MAX_WRITE)) {
      const docs = await this.db.transaction('r', syncTables(this.db), () =>
        Promise.all(
          chunk.map(async (e): Promise<OutgoingDoc> => ({
            table: e.table,
            docId: e.docId,
            record: (await readRecord(this.db, e.table, e.docId)) ?? null,
          })),
        ),
      );
      await this.remote.write(docs);
      await removeSent(this.db, chunk);
    }
    this.state.error = null;
    if ((await this.db.outbox.count()) === 0) await touchLastSyncedAt(this.db);
  }

  private enqueueApply(table: SyncTable, docs: RemoteDoc[], fromServer: boolean) {
    this.applying = this.applying
      .then(() => this.apply(table, docs, fromServer))
      .catch((e: unknown) => this.fail(toSyncError(e)));
  }

  /** クラウドの変更を1つのトランザクションで書き、受信の続きの位置を進める */
  private async apply(table: SyncTable, docs: RemoteDoc[], fromServer: boolean) {
    if (this.stopped) return;
    const db = this.db;
    let invalid = 0;
    // 取引を書くときは増減の表も同じトランザクションで更新される（他の表では使わないが常に含める）
    await db.transaction(
      'rw',
      [db.table(table), db.balanceDeltas, db.outbox, db.meta],
      async () => {
        let cursor = await readCursor(db, table);
        const start = cursor;
        for (const doc of docs) {
          if (isAfter(doc.syncedAt, cursor)) cursor = doc.syncedAt;
          // 端末の未送信の変更を優先する。あとで送られてクラウドでも後勝ちになる
          if (await db.outbox.get([table, doc.docId])) continue;
          if (doc.deleted) {
            await deleteRecord(db, table, doc.docId);
            continue;
          }
          const record = parseRemoteRecord(table, doc.docId, doc.data);
          if (record) await putRecord(db, table, record);
          else invalid++;
        }
        if (cursor !== start) await writeCursor(db, table, cursor);
        if (fromServer) await touchLastSyncedAt(db);
      },
    );
    this.state.invalidRecords += invalid;
    if (fromServer) {
      this.waitingFirst.delete(table);
      if (this.state.error?.kind === 'offline') this.state.error = null;
    }
    this.emit();
  }

  private fail(error: SyncError) {
    this.state.error = error;
    this.emit();
  }

  private emit() {
    this.state = {
      ...this.state,
      busy: this.pushing !== null || (!this.stopped && this.waitingFirst.size > 0),
    };
    this.onState(this.state);
  }
}

/** 送った outbox を、送ったあとに書き換えられていないもの（token が同じもの）だけ消す */
async function removeSent(db: YarikuriDB, sent: readonly OutboxEntry[]) {
  await db.transaction('rw', db.outbox, async () => {
    for (const e of sent) {
      const current = await db.outbox.get([e.table, e.docId]);
      if (current?.token === e.token) await db.outbox.delete([e.table, e.docId]);
    }
  });
}

// ---- 初めてサインインした端末 ----

export interface LinkPrompts {
  /** クラウドが空のとき、端末のデータを送ってよいか */
  confirmUpload(): Promise<boolean>;
  /** クラウドにデータがあり、端末に取引があるとき、端末のデータを置き換えてよいか */
  confirmReplace(): Promise<boolean>;
}

export const OFFLINE_LINK_MESSAGE = '初めてのサインインには通信が必要です';

/**
 * 端末とアカウントをつなぐ。端末とクラウドのデータは混ぜず、クラウドが空なら端末のデータを送り、
 * データがあれば端末をクラウドの内容で置き換える。最後に syncUid を記録し、途中で失敗したら記録しない
 */
export async function linkDevice(
  db: YarikuriDB,
  remote: SyncRemote,
  uid: string,
  prompts: LinkPrompts,
): Promise<'linked' | 'cancelled'> {
  let hasData: boolean;
  try {
    hasData = await remote.hasCloudData();
  } catch (e) {
    const error = toSyncError(e);
    throw error.kind === 'offline' ? new SyncError('offline', OFFLINE_LINK_MESSAGE) : error;
  }
  return hasData ? replaceWithCloud(db, remote, uid, prompts) : uploadAll(db, remote, uid, prompts);
}

async function uploadAll(
  db: YarikuriDB,
  remote: SyncRemote,
  uid: string,
  prompts: LinkPrompts,
): Promise<'linked' | 'cancelled'> {
  if (!(await prompts.confirmUpload())) return 'cancelled';
  // 送っている間に書かれた変更は outbox に残し、同期を始めてから送る
  const { docs, queued } = await db.transaction('r', [...syncTables(db), db.outbox], async () => {
    const perTable = await Promise.all(
      SYNC_TABLES.map(async (table) =>
        ((await db.table(table).toArray()) as SyncRecord[]).map((record): OutgoingDoc => ({
          table,
          docId: docIdOf(table, record as never),
          record,
        })),
      ),
    );
    return { docs: perTable.flat(), queued: await db.outbox.toArray() };
  });
  for (const chunk of chunks(docs, MAX_WRITE)) await remote.write(chunk);
  await remote.markInitialized();
  await removeSent(db, queued);
  await db.transaction('rw', db.meta, async () => {
    for (const table of SYNC_TABLES) await writeCursor(db, table, null);
    await db.meta.put({ key: 'syncUid', value: uid });
    await touchLastSyncedAt(db);
  });
  return 'linked';
}

async function replaceWithCloud(
  db: YarikuriDB,
  remote: SyncRemote,
  uid: string,
  prompts: LinkPrompts,
): Promise<'linked' | 'cancelled'> {
  if ((await db.transactions.count()) > 0 && !(await prompts.confirmReplace())) {
    return 'cancelled';
  }
  const fetched = await Promise.all(SYNC_TABLES.map((table) => remote.fetchAll(table)));
  await db.transaction(
    'rw',
    [...syncTables(db), db.balanceDeltas, db.outbox, db.meta],
    async () => {
      for (const [i, table] of SYNC_TABLES.entries()) {
        let cursor: Cursor | null = null;
        const records: SyncRecord[] = [];
        for (const doc of fetched[i]) {
          if (isAfter(doc.syncedAt, cursor)) cursor = doc.syncedAt;
          if (doc.deleted) continue;
          const record = parseRemoteRecord(table, doc.docId, doc.data);
          if (record) records.push(record);
        }
        await db.table(table).clear();
        await db.table(table).bulkPut(records);
        await writeCursor(db, table, cursor);
      }
      await db.outbox.clear();
      // 既定の「財布」と初期カテゴリを入れ直さない
      if (!(await db.meta.get('seeded'))) {
        await db.meta.put({ key: 'seeded', value: new Date().toISOString() });
      }
      await db.meta.put({ key: 'syncUid', value: uid });
      await touchLastSyncedAt(db);
    },
  );
  return 'linked';
}
