import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { balancesAtMonthEnd, computeBalances, type BalanceDelta } from '../domain/balance';
import { lastDayOfMonth } from '../domain/date';
import type { Transaction } from '../domain/types';
import { makeAccount, makeCategory, makeTx } from '../test/factories';
import { expectDeltasMatchTransactions as expectTableMatches } from '../test/db';
import { makeManyTransactions } from '../test/manyTransactions';
import { MissingBalanceDeltasError } from './balanceDeltas';
import { rebuildBalanceDeltas, YarikuriDB } from './db';

let db: YarikuriDB;
let n = 0;
let name: string;

const wallet = makeAccount('財布', 'cash', 15_000);
const bank = makeAccount('A銀行', 'bank', 320_000);
const card = makeAccount('Aカード', 'credit');
const accounts = [wallet, bank, card];
const categories = [makeCategory('食費'), makeCategory('給与', 'income')];

beforeEach(async () => {
  name = `db-test-${++n}`;
  db = new YarikuriDB(name);
  await db.open();
  await db.accounts.bulkAdd(accounts);
});

afterEach(async () => {
  await db.delete();
});

const sortDeltas = (deltas: BalanceDelta[]) =>
  [...deltas].sort(
    (a, b) => a.accountId.localeCompare(b.accountId) || a.month.localeCompare(b.month),
  );

/** 増減の表が、その時点の全取引から作った増減と一致することを確かめる */
async function expectDeltasMatchTransactions(target: YarikuriDB = db) {
  await expectTableMatches(target);
  const transactions = await target.transactions.toArray();
  const deltas = await target.balanceDeltas.toArray();
  for (const month of ['2024-01', '2025-06', '2026-10']) {
    expect(balancesAtMonthEnd(accounts, deltas, month)).toEqual(
      computeBalances(accounts, transactions, lastDayOfMonth(month)),
    );
  }
}

const write = <T>(fn: () => Promise<T>) =>
  db.transaction('rw', db.transactions, db.balanceDeltas, fn);

describe('version 4 への更新', () => {
  it('version 3 の DB にある取引から増減の表を作る', async () => {
    await db.delete();
    const old = new Dexie(name);
    old.version(3).stores({
      accounts: 'id, type, sortOrder',
      categories: 'id, kind, sortOrder',
      transactions: 'id, date, accountId, toAccountId, categoryId',
      meta: 'key',
      budgets: '[categoryId+month], categoryId',
      outbox: '[table+docId]',
    });
    await old.open();
    await old.table('accounts').bulkAdd(accounts);
    await old
      .table('transactions')
      .bulkAdd(
        makeManyTransactions({ accounts, categories, count: 500, endMonth: '2026-10', months: 30 }),
      );
    old.close();

    db = new YarikuriDB(name);
    await db.open();
    expect(db.verno).toBe(4);
    expect(await db.balanceDeltas.count()).toBeGreaterThan(0);
    await expectDeltasMatchTransactions();
  });

  it('作り直すと食い違った表が全取引と一致する', async () => {
    await write(() =>
      db.transactions.bulkAdd([makeTx({ type: 'income', amount: 500, accountId: wallet.id })]),
    );
    // ミドルウェアを通さずに表を壊す
    await db.balanceDeltas.put({ accountId: wallet.id, month: '2020-01', delta: 999 });
    await rebuildBalanceDeltas(db);
    await expectDeltasMatchTransactions();
  });
});

describe('取引の書き込みに合わせた増減の表の更新', () => {
  const expense = (extra: Partial<Transaction> = {}) =>
    makeTx({ type: 'expense', amount: 1_000, accountId: wallet.id, date: '2026-03-10', ...extra });

  it('追加', async () => {
    await write(() => db.transactions.add(expense()));
    expect(await db.balanceDeltas.toArray()).toEqual([
      { accountId: wallet.id, month: '2026-03', delta: -1_000 },
    ]);
    await expectDeltasMatchTransactions();
  });

  it('同じ月での編集', async () => {
    const tx = expense();
    await write(() => db.transactions.add(tx));
    await write(() => db.transactions.put({ ...tx, amount: 1_500, date: '2026-03-20' }));
    expect(await db.balanceDeltas.toArray()).toEqual([
      { accountId: wallet.id, month: '2026-03', delta: -1_500 },
    ]);
    await expectDeltasMatchTransactions();
  });

  it('月をまたぐ編集では元の月の行が消える', async () => {
    const tx = expense();
    await write(() => db.transactions.add(tx));
    await write(() => db.transactions.update(tx.id, { date: '2024-12-31' }));
    expect(await db.balanceDeltas.toArray()).toEqual([
      { accountId: wallet.id, month: '2024-12', delta: -1_000 },
    ]);
    await expectDeltasMatchTransactions();
  });

  it('口座を変える編集と、振替への種類の変更', async () => {
    const tx = expense();
    await write(() => db.transactions.add(tx));
    await write(() => db.transactions.put({ ...tx, accountId: bank.id }));
    await expectDeltasMatchTransactions();
    await write(() =>
      db.transactions.put({
        ...tx,
        type: 'transfer',
        accountId: bank.id,
        toAccountId: wallet.id,
        categoryId: undefined,
      }),
    );
    expect(sortDeltas(await db.balanceDeltas.toArray())).toEqual(
      sortDeltas([
        { accountId: bank.id, month: '2026-03', delta: -1_000 },
        { accountId: wallet.id, month: '2026-03', delta: 1_000 },
      ]),
    );
    await expectDeltasMatchTransactions();
  });

  it('削除', async () => {
    const a = expense();
    const b = expense({ amount: 300 });
    await write(() => db.transactions.bulkAdd([a, b]));
    await write(() => db.transactions.delete(a.id));
    expect(await db.balanceDeltas.toArray()).toEqual([
      { accountId: wallet.id, month: '2026-03', delta: -300 },
    ]);
    await write(() => db.transactions.delete(b.id));
    expect(await db.balanceDeltas.count()).toBe(0);
  });

  it('bulkPut で新規と既存が混ざる', async () => {
    const many = makeManyTransactions({
      accounts,
      categories,
      count: 400,
      endMonth: '2026-10',
      months: 36,
    });
    await write(() => db.transactions.bulkPut(many.slice(0, 200)));
    await write(() =>
      db.transactions.bulkPut([
        ...many.slice(100, 400),
        ...many.slice(0, 50).map((t) => ({ ...t, amount: t.amount + 1 })),
      ]),
    );
    await expectDeltasMatchTransactions();
  });

  it('同じ要求の中で同じ取引を何度も書く', async () => {
    const tx = expense();
    await write(() =>
      db.transactions.bulkPut([tx, { ...tx, amount: 2_000 }, { ...tx, amount: 3_000 }]),
    );
    expect(await db.balanceDeltas.toArray()).toEqual([
      { accountId: wallet.id, month: '2026-03', delta: -3_000 },
    ]);
  });

  it('範囲を指定した削除', async () => {
    const many = makeManyTransactions({
      accounts,
      categories,
      count: 300,
      endMonth: '2026-10',
      months: 24,
    });
    await write(() => db.transactions.bulkAdd(many));
    await write(() => db.transactions.where('date').below('2025-06-01').delete());
    await write(() => db.transactions.where('id').between('many-1-1', 'many-1-2').delete());
    await expectDeltasMatchTransactions();
  });

  it('clear では増減の表も空になる', async () => {
    await write(() => db.transactions.bulkAdd([expense(), expense({ accountId: bank.id })]));
    await write(() => db.transactions.clear());
    expect(await db.balanceDeltas.count()).toBe(0);
  });

  it('追加の一部が失敗しても、書けた取引だけが増減に入る', async () => {
    const a = expense();
    await write(() => db.transactions.add(a));
    const b = expense({ amount: 200 });
    await write(async () => {
      await db.transactions.bulkAdd([b, { ...a, amount: 9_999 }]).catch(() => undefined);
    });
    expect(await db.transactions.count()).toBe(2);
    await expectDeltasMatchTransactions();
  });

  it('balanceDeltas を含まないトランザクションでは書き込めず、取引も書かれない', async () => {
    await expect(db.transactions.add(expense())).rejects.toBeInstanceOf(MissingBalanceDeltasError);
    await expect(
      db.transaction('rw', db.transactions, db.outbox, () => db.transactions.add(expense())),
    ).rejects.toBeInstanceOf(MissingBalanceDeltasError);
    expect(await db.transactions.count()).toBe(0);
  });
});
