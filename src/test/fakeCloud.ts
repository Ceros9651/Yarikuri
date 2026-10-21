import { SYNC_TABLES, type SyncTable } from '../sync/docs';
import {
  isAfter,
  SyncError,
  type Cursor,
  type OutgoingDoc,
  type RemoteDoc,
  type SyncAuth,
  type SyncRemote,
  type SyncUser,
} from '../sync/remote';

interface StoredDoc {
  data: unknown;
  deleted: boolean;
  syncedAt: Cursor;
}

interface Account {
  initialized: boolean;
  tables: Record<SyncTable, Map<string, StoredDoc>>;
}

interface Listener {
  uid: string;
  table: SyncTable;
  cursor: Cursor | null;
  onDocs: (docs: RemoteDoc[], fromServer: boolean) => void;
  onError: (error: SyncError) => void;
  active: boolean;
}

/**
 * テスト用のクラウド。複数の端末（Dexie）から同じインスタンスの remote() を使えば共有できる。
 * オフライン（送受信はつながるまで待つ）と、失敗の注入ができる
 */
export class FakeCloud {
  private accounts = new Map<string, Account>();
  private clock = 0;
  private online = true;
  private waiters: (() => void)[] = [];
  private listeners = new Set<Listener>();
  /** 設定すると、以後の読み書き・購読がこのエラーで失敗する */
  failure: SyncError | null = null;
  /** write が呼ばれた回数 */
  writes = 0;

  private account(uid: string): Account {
    let account = this.accounts.get(uid);
    if (!account) {
      account = {
        initialized: false,
        tables: Object.fromEntries(SYNC_TABLES.map((t) => [t, new Map()])) as Account['tables'],
      };
      this.accounts.set(uid, account);
    }
    return account;
  }

  setOnline(online: boolean) {
    this.online = online;
    if (online) {
      const waiters = this.waiters;
      this.waiters = [];
      waiters.forEach((resolve) => resolve());
    }
  }

  private whenOnline(): Promise<void> {
    return this.online ? Promise.resolve() : new Promise((resolve) => this.waiters.push(resolve));
  }

  private assertReachable() {
    if (this.failure) throw this.failure;
    if (!this.online) throw new SyncError('offline', 'オフラインです');
  }

  /** クラウドの記録をそのまま見る */
  stored(uid: string, table: SyncTable): Map<string, StoredDoc> {
    return this.account(uid).tables[table];
  }

  isInitialized(uid: string): boolean {
    return this.account(uid).initialized;
  }

  /** 他の端末から書かれたものとして、検証を通さずに記録を置く */
  async inject(uid: string, table: SyncTable, docId: string, data: unknown) {
    await this.commit(uid, [{ table, docId, data, deleted: data === null }]);
  }

  private async commit(
    uid: string,
    docs: { table: SyncTable; docId: string; data: unknown; deleted: boolean }[],
  ) {
    const syncedAt = { seconds: ++this.clock, nanoseconds: 0 };
    const account = this.account(uid);
    for (const doc of docs) {
      // Firestore と同じく undefined の項目は保存しない
      const data = doc.data === null ? null : JSON.parse(JSON.stringify(doc.data));
      account.tables[doc.table].set(doc.docId, { data, deleted: doc.deleted, syncedAt });
    }
    for (const listener of this.listeners) {
      if (listener.uid !== uid) continue;
      const changed = docs
        .filter((d) => d.table === listener.table)
        .map((d) => ({ docId: d.docId, ...account.tables[d.table].get(d.docId)! }));
      if (changed.length > 0) void this.deliver(listener, changed);
    }
  }

  private async deliver(listener: Listener, docs: RemoteDoc[]) {
    await this.whenOnline();
    await Promise.resolve();
    if (!listener.active) return;
    const after = docs.filter((d) => isAfter(d.syncedAt, listener.cursor));
    listener.onDocs(after, true);
  }

  remote(uid: string): SyncRemote {
    return {
      hasCloudData: async () => {
        this.assertReachable();
        return this.account(uid).initialized;
      },
      fetchAll: async (table) => {
        this.assertReachable();
        return [...this.account(uid).tables[table]].map(([docId, d]) => ({ docId, ...d }));
      },
      write: async (docs) => {
        this.writes++;
        await this.whenOnline();
        if (this.failure) throw this.failure;
        await this.commit(
          uid,
          docs.map((d: OutgoingDoc) => ({
            table: d.table,
            docId: d.docId,
            data: d.record,
            deleted: d.record === null,
          })),
        );
      },
      markInitialized: async () => {
        this.assertReachable();
        this.account(uid).initialized = true;
      },
      subscribe: (table, after, onDocs, onError) => {
        const listener: Listener = { uid, table, cursor: after, onDocs, onError, active: true };
        this.listeners.add(listener);
        void (async () => {
          await this.whenOnline();
          await Promise.resolve();
          if (!listener.active) return;
          if (this.failure) {
            onError(this.failure);
            return;
          }
          const docs = [...this.account(uid).tables[table]]
            .map(([docId, d]) => ({ docId, ...d }))
            .filter((d) => isAfter(d.syncedAt, after))
            .sort((a, b) => a.syncedAt.seconds - b.syncedAt.seconds);
          onDocs(docs, true);
        })();
        return () => {
          listener.active = false;
          this.listeners.delete(listener);
        };
      },
    };
  }

  /** 購読中の数（購読のやめ忘れの確認用） */
  get listenerCount(): number {
    return this.listeners.size;
  }
}

/** テスト用のサインイン。signIn で返すアカウントと、閉じた（null）を切り替えられる */
export class FakeAuth implements SyncAuth {
  user: SyncUser | null = null;
  /** 次の signIn で選ばれるアカウント。null ならアカウント選択を閉じたことにする */
  next: SyncUser | null = { uid: 'user-1', email: 'me@example.com' };
  private callbacks = new Set<(user: SyncUser | null) => void>();

  onChange(callback: (user: SyncUser | null) => void): () => void {
    this.callbacks.add(callback);
    const current = this.user;
    queueMicrotask(() => callback(current));
    return () => this.callbacks.delete(callback);
  }

  async signIn(): Promise<SyncUser | null> {
    if (!this.next) return null;
    this.set(this.next);
    return this.next;
  }

  async signOut(): Promise<void> {
    this.set(null);
  }

  private set(user: SyncUser | null) {
    this.user = user;
    this.callbacks.forEach((cb) => cb(user));
  }
}
