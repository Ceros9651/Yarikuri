import { afterEach, describe, expect, it, vi } from 'vitest';
import { YarikuriDB } from '../db/db';
import * as repo from '../db/repository';
import { ensureSeeded } from '../db/seed';
import type { TransactionDraft } from '../domain/validation';
import { FakeCloud } from '../test/fakeCloud';
import {
  clearSyncState,
  getSyncUid,
  linkDevice,
  OFFLINE_LINK_MESSAGE,
  readCursor,
  SyncEngine,
  type EngineState,
} from './engine';
import { SyncError, type RemoteDoc, type SyncRemote } from './remote';

const UID = 'user-1';
let n = 0;
const devices: YarikuriDB[] = [];
const engines: SyncEngine[] = [];

afterEach(async () => {
  engines.splice(0).forEach((e) => e.stop());
  await Promise.all(devices.splice(0).map((d) => d.delete()));
});

function newDevice(): YarikuriDB {
  const db = new YarikuriDB(`sync-test-${++n}`);
  devices.push(db);
  return db;
}

const yes = { confirmUpload: async () => true, confirmReplace: async () => true };

function startEngine(db: YarikuriDB, remote: SyncRemote, onState?: (s: EngineState) => void) {
  const engine = new SyncEngine(db, remote, onState);
  engines.push(engine);
  void engine.start();
  return engine;
}

/** 端末を用意してつなぎ、同期を始める。最初の端末はクラウドへ送り、2台目以降は置き換える */
async function connectedDevice(cloud: FakeCloud) {
  const db = newDevice();
  await ensureSeeded(db);
  expect(await linkDevice(db, cloud.remote(UID), UID, yes)).toBe('linked');
  const engine = startEngine(db, cloud.remote(UID));
  await engine.settle();
  return { db, engine };
}

const draft = (d: Partial<TransactionDraft>): TransactionDraft => ({
  type: 'expense',
  date: '2026-10-15',
  amount: '1200',
  accountId: '',
  toAccountId: '',
  categoryId: '',
  ...d,
});

async function walletAndFood(db: YarikuriDB) {
  const wallet = (await db.accounts.toArray()).find((a) => a.name === '財布')!.id;
  const food = (await db.categories.toArray()).find((c) => c.name === '食費')!.id;
  return { wallet, food };
}

async function addExpense(db: YarikuriDB, amount = '1200', id?: string) {
  const { wallet, food } = await walletAndFood(db);
  return repo.saveTransaction(draft({ accountId: wallet, categoryId: food, amount }), '', id, db);
}

describe('送信', () => {
  it('記録・編集・削除がクラウドに届き、送り終えると outbox が空になる', async () => {
    const cloud = new FakeCloud();
    const { db: a } = await connectedDevice(cloud);
    const id = await addExpense(a);
    await vi.waitFor(() =>
      expect(cloud.stored(UID, 'transactions').get(id)?.data).toMatchObject({ amount: 1200 }),
    );

    await addExpense(a, '1500', id);
    await vi.waitFor(() =>
      expect(cloud.stored(UID, 'transactions').get(id)?.data).toMatchObject({ amount: 1500 }),
    );

    await repo.deleteTransaction(id, a);
    await vi.waitFor(() =>
      expect(cloud.stored(UID, 'transactions').get(id)).toMatchObject({
        data: null,
        deleted: true,
      }),
    );
    await vi.waitFor(async () => expect(await a.outbox.count()).toBe(0));
    expect(await a.meta.get('lastSyncedAt')).toBeDefined();
  });

  it('送信中に同じ取引をもう一度変えると outbox に残り、新しい内容が後から届く', async () => {
    const cloud = new FakeCloud();
    const { db: a, engine } = await connectedDevice(cloud);
    cloud.setOnline(false);
    const id = await addExpense(a, '1000');
    await vi.waitFor(() => expect(cloud.writes).toBeGreaterThan(0));
    await addExpense(a, '2000', id);

    cloud.setOnline(true);
    await vi.waitFor(() =>
      expect(cloud.stored(UID, 'transactions').get(id)?.data).toMatchObject({ amount: 2000 }),
    );
    await engine.settle();
    expect(await a.outbox.count()).toBe(0);
  });

  it('オフラインのあいだは outbox に残り、つながると送られる', async () => {
    const cloud = new FakeCloud();
    const { db: a } = await connectedDevice(cloud);
    cloud.setOnline(false);
    const id = await addExpense(a);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(await a.outbox.get(['transactions', id])).toBeDefined();
    expect(cloud.stored(UID, 'transactions').has(id)).toBe(false);

    cloud.setOnline(true);
    await vi.waitFor(() => expect(cloud.stored(UID, 'transactions').has(id)).toBe(true));
    await vi.waitFor(async () => expect(await a.outbox.count()).toBe(0));
  });

  it('送る前にアプリを閉じても、次に起動したときに送る', async () => {
    const cloud = new FakeCloud();
    const { db: a, engine } = await connectedDevice(cloud);
    engine.stop();
    const id = await addExpense(a);

    startEngine(a, cloud.remote(UID));
    await vi.waitFor(() => expect(cloud.stored(UID, 'transactions').has(id)).toBe(true));
  });

  it('送信に失敗したら状態にエラーを出し、outbox は残す', async () => {
    const cloud = new FakeCloud();
    const a = newDevice();
    await ensureSeeded(a);
    await linkDevice(a, cloud.remote(UID), UID, yes);
    const states: EngineState[] = [];
    startEngine(a, cloud.remote(UID), (s) => states.push(s));
    cloud.failure = new SyncError('quota', '無料枠の上限に達しました');
    const id = await addExpense(a);

    await vi.waitFor(() => expect(states.at(-1)?.error?.kind).toBe('quota'));
    expect(await a.outbox.get(['transactions', id])).toBeDefined();
  });
});

describe('受信', () => {
  it('他の端末の記録・編集・削除が反映される', async () => {
    const cloud = new FakeCloud();
    const { db: a } = await connectedDevice(cloud);
    const { db: b } = await connectedDevice(cloud);

    const id = await addExpense(a, '1200');
    await vi.waitFor(async () =>
      expect(await b.transactions.get(id)).toMatchObject({ amount: 1200 }),
    );
    await addExpense(a, '1500', id);
    await vi.waitFor(async () =>
      expect(await b.transactions.get(id)).toMatchObject({ amount: 1500 }),
    );
    await repo.deleteTransaction(id, a);
    await vi.waitFor(async () => expect(await b.transactions.get(id)).toBeUndefined());
    // 受け取った変更は送り返さない
    expect(await b.outbox.count()).toBe(0);
  });

  it('口座の追加・カテゴリの名前変更・並べ替え・予算の設定が反映される', async () => {
    const cloud = new FakeCloud();
    const { db: a } = await connectedDevice(cloud);
    const { db: b } = await connectedDevice(cloud);

    const bank = await repo.addAccount({ name: 'A銀行', type: 'bank', initialBalance: 5000 }, a);
    const { food } = await walletAndFood(a);
    await repo.renameCategory(food, '食料品', a);
    const expense = await a.categories.where('kind').equals('expense').sortBy('sortOrder');
    await repo.reorderCategories([expense[1].id, expense[0].id], a);
    await repo.setBudget(food, '2026-10', '40000', a);

    await vi.waitFor(async () => {
      expect(await b.accounts.get(bank)).toMatchObject({ name: 'A銀行', initialBalance: 5000 });
      expect(await b.categories.get(food)).toMatchObject({ name: '食料品' });
      const order = await b.categories.where('kind').equals('expense').sortBy('sortOrder');
      expect(order.slice(0, 2).map((c) => c.id)).toEqual([expense[1].id, expense[0].id]);
      expect(await b.budgets.get([food, '2026-10'])).toMatchObject({ amount: 40_000 });
    });
  });

  it('別々の端末でほぼ同時に記録した取引は両方残る', async () => {
    const cloud = new FakeCloud();
    const { db: a } = await connectedDevice(cloud);
    const { db: b } = await connectedDevice(cloud);

    const [fromA, fromB] = await Promise.all([addExpense(a, '100'), addExpense(b, '200')]);
    for (const db of [a, b]) {
      await vi.waitFor(async () => {
        expect(await db.transactions.get(fromA)).toMatchObject({ amount: 100 });
        expect(await db.transactions.get(fromB)).toMatchObject({ amount: 200 });
      });
    }
  });

  it('同じ取引を別々に変えたら、後からクラウドに届いた変更が両方の端末に残る', async () => {
    const cloud = new FakeCloud();
    const { db: a } = await connectedDevice(cloud);
    const { db: b, engine: engineB } = await connectedDevice(cloud);
    const id = await addExpense(a, '1200');
    await vi.waitFor(async () => expect(await b.transactions.get(id)).toBeDefined());

    // B がオフラインのあいだに B で 1,500円、A で 1,800円に変える
    engineB.stop();
    await addExpense(b, '1500', id);
    await addExpense(a, '1800', id);
    await vi.waitFor(() =>
      expect(cloud.stored(UID, 'transactions').get(id)?.data).toMatchObject({ amount: 1800 }),
    );

    // B がつながると、B の変更が後から届く
    startEngine(b, cloud.remote(UID));
    for (const db of [a, b]) {
      await vi.waitFor(async () =>
        expect(await db.transactions.get(id)).toMatchObject({ amount: 1500 }),
      );
    }
    expect(cloud.stored(UID, 'transactions').get(id)?.data).toMatchObject({ amount: 1500 });
  });

  it('起動し直すと前回の続きから受け取る', async () => {
    const cloud = new FakeCloud();
    const { db: a } = await connectedDevice(cloud);
    const { db: b, engine } = await connectedDevice(cloud);
    await addExpense(a, '100');
    await vi.waitFor(async () => expect(await b.transactions.count()).toBe(1));
    engine.stop();
    const cursor = await readCursor(b, 'transactions');
    expect(cursor).not.toBeNull();

    const later = await addExpense(a, '200');
    const received: RemoteDoc[][] = [];
    const remote = cloud.remote(UID);
    const recording: SyncRemote = {
      ...remote,
      subscribe: (table, after, onDocs, onError) =>
        remote.subscribe(
          table,
          after,
          (docs, fromServer) => {
            if (table === 'transactions') received.push(docs);
            onDocs(docs, fromServer);
          },
          onError,
        ),
    };
    startEngine(b, recording);
    await vi.waitFor(async () => expect(await b.transactions.get(later)).toBeDefined());
    expect(received[0].map((d) => d.docId)).toEqual([later]);
  });

  it('形式の読めない記録は取り込まない', async () => {
    const cloud = new FakeCloud();
    const states: EngineState[] = [];
    const { db: b, engine } = await connectedDevice(cloud);
    engine.stop();
    startEngine(b, cloud.remote(UID), (s) => states.push(s));
    await cloud.inject(UID, 'transactions', 'bad', { id: 'bad', amount: 'abc' });

    await vi.waitFor(() => expect(states.at(-1)?.invalidRecords).toBe(1));
    expect(await b.transactions.get('bad')).toBeUndefined();
  });
});

describe('初めてサインインした端末', () => {
  it('クラウドが空なら全データを送り、2台目は同じ内容になって財布と初期カテゴリが二重にならない', async () => {
    const cloud = new FakeCloud();
    const { db: a } = await connectedDevice(cloud);
    const id = await addExpense(a);
    await repo.setBudget((await walletAndFood(a)).food, '2026-10', '30000', a);
    await vi.waitFor(async () => expect(await a.outbox.count()).toBe(0));
    expect(cloud.isInitialized(UID)).toBe(true);

    const b = newDevice();
    await ensureSeeded(b);
    const confirmReplace = vi.fn(async () => true);
    expect(await linkDevice(b, cloud.remote(UID), UID, { ...yes, confirmReplace })).toBe('linked');
    // B には取引がないので確認しない
    expect(confirmReplace).not.toHaveBeenCalled();
    expect(await b.accounts.toArray()).toEqual(await a.accounts.toArray());
    expect(await b.categories.toArray()).toEqual(await a.categories.toArray());
    expect(await b.budgets.toArray()).toEqual(await a.budgets.toArray());
    expect(await b.transactions.get(id)).toEqual(await a.transactions.get(id));
    expect(await b.outbox.count()).toBe(0);
    expect(await getSyncUid(b)).toBe(UID);
  });

  it('最初の端末で、送る前にキャンセルすると何も変わらない', async () => {
    const cloud = new FakeCloud();
    const a = newDevice();
    await ensureSeeded(a);
    const result = await linkDevice(a, cloud.remote(UID), UID, {
      ...yes,
      confirmUpload: async () => false,
    });
    expect(result).toBe('cancelled');
    expect(cloud.isInitialized(UID)).toBe(false);
    expect(cloud.stored(UID, 'accounts').size).toBe(0);
    expect(await getSyncUid(a)).toBeUndefined();
  });

  it('送っている途中で失敗すると syncUid を記録せず、クラウドにもデータがあることにならない', async () => {
    const cloud = new FakeCloud();
    const a = newDevice();
    await ensureSeeded(a);
    const remote = cloud.remote(UID);
    const failing: SyncRemote = {
      ...remote,
      write: async () => {
        throw new SyncError('other', '送れませんでした');
      },
    };
    await expect(linkDevice(a, failing, UID, yes)).rejects.toThrow('送れませんでした');
    expect(await getSyncUid(a)).toBeUndefined();
    expect(cloud.isInitialized(UID)).toBe(false);
  });

  it('取引のある端末は、確認のうえクラウドの内容で置き換わる', async () => {
    const cloud = new FakeCloud();
    await connectedDevice(cloud);
    const b = newDevice();
    await ensureSeeded(b);
    const local = await addExpense(b, '999');

    const confirmReplace = vi.fn(async () => true);
    await linkDevice(b, cloud.remote(UID), UID, { ...yes, confirmReplace });
    expect(confirmReplace).toHaveBeenCalledOnce();
    expect(await b.transactions.get(local)).toBeUndefined();
  });

  it('置き換えの確認でキャンセルすると端末のデータは変わらない', async () => {
    const cloud = new FakeCloud();
    await connectedDevice(cloud);
    const b = newDevice();
    await ensureSeeded(b);
    const local = await addExpense(b, '999');

    const result = await linkDevice(b, cloud.remote(UID), UID, {
      ...yes,
      confirmReplace: async () => false,
    });
    expect(result).toBe('cancelled');
    expect(await b.transactions.get(local)).toBeDefined();
    expect(await getSyncUid(b)).toBeUndefined();
  });

  it('オフラインでは「通信が必要」で失敗する', async () => {
    const cloud = new FakeCloud();
    cloud.setOnline(false);
    const a = newDevice();
    await ensureSeeded(a);
    await expect(linkDevice(a, cloud.remote(UID), UID, yes)).rejects.toThrow(OFFLINE_LINK_MESSAGE);
  });

  it('同期の記録を消すと syncUid と続きの位置が消え、記録と outbox は残る', async () => {
    const cloud = new FakeCloud();
    const { db: a, engine } = await connectedDevice(cloud);
    engine.stop();
    const id = await addExpense(a);
    await clearSyncState(a);
    expect(await getSyncUid(a)).toBeUndefined();
    expect(await a.meta.get('lastSyncedAt')).toBeUndefined();
    expect(await a.transactions.get(id)).toBeDefined();
    expect(await a.outbox.get(['transactions', id])).toBeDefined();
  });
});
