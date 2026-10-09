import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { computeBalance } from '../domain/balance';
import type { TransactionDraft } from '../domain/validation';
import { YarikuriDB } from './db';
import * as repo from './repository';
import { DEFAULT_EXPENSE_CATEGORIES, DEFAULT_INCOME_CATEGORIES, ensureSeeded } from './seed';

let db: YarikuriDB;
let n = 0;

beforeEach(async () => {
  db = new YarikuriDB(`test-${++n}`);
  await db.open();
});

afterEach(async () => {
  await db.delete();
});

const draft = (d: Partial<TransactionDraft>): TransactionDraft => ({
  type: 'expense',
  date: '2026-10-10',
  amount: '800',
  accountId: '',
  toAccountId: '',
  categoryId: '',
  ...d,
});

describe('スキーマ', () => {
  it('fake-indexeddb で開ける', async () => {
    expect(db.isOpen()).toBe(true);
    expect(db.tables.map((t) => t.name).sort()).toEqual([
      'accounts',
      'budgets',
      'categories',
      'meta',
      'transactions',
    ]);
  });

  it('version 1 の DB を開き直すと既存データが残り、空の budgets が使える', async () => {
    const name = `test-upgrade-${++n}`;
    const old = new Dexie(name);
    old.version(1).stores({
      accounts: 'id, type, sortOrder',
      categories: 'id, kind, sortOrder',
      transactions: 'id, date, accountId, toAccountId, categoryId',
      meta: 'key',
    });
    await old.table('categories').add({
      id: 'c1',
      kind: 'expense',
      name: '食費',
      hidden: false,
      sortOrder: 0,
    });
    old.close();

    const upgraded = new YarikuriDB(name);
    try {
      expect(await upgraded.categories.get('c1')).toMatchObject({ name: '食費' });
      expect(await upgraded.budgets.count()).toBe(0);
      await repo.setBudget('c1', '2026-10', '40000', upgraded);
      expect(await upgraded.budgets.toArray()).toEqual([
        { categoryId: 'c1', month: '2026-10', amount: 40_000 },
      ]);
    } finally {
      await upgraded.delete();
    }
  });
});

describe('既定データの投入', () => {
  it('初回起動で「財布」と初期カテゴリが入る', async () => {
    await ensureSeeded(db);
    const accounts = await db.accounts.toArray();
    expect(accounts).toHaveLength(1);
    expect(accounts[0]).toMatchObject({ name: '財布', type: 'cash', initialBalance: 0 });
    const expense = await db.categories.where('kind').equals('expense').sortBy('sortOrder');
    expect(expense.map((c) => c.name)).toEqual(DEFAULT_EXPENSE_CATEGORIES);
    const income = await db.categories.where('kind').equals('income').sortBy('sortOrder');
    expect(income.map((c) => c.name)).toEqual(DEFAULT_INCOME_CATEGORIES);
  });

  it('2回起動しても重複しない', async () => {
    await Promise.all([ensureSeeded(db), ensureSeeded(db)]);
    await ensureSeeded(db);
    expect(await db.accounts.count()).toBe(1);
    expect(await db.categories.count()).toBe(
      DEFAULT_EXPENSE_CATEGORIES.length + DEFAULT_INCOME_CATEGORIES.length,
    );
  });
});

describe('口座', () => {
  it('複数の銀行口座とカードを登録できる', async () => {
    await repo.addAccount({ name: 'A銀行', type: 'bank', initialBalance: 120_000 }, db);
    await repo.addAccount({ name: 'B銀行', type: 'bank' }, db);
    await repo.addAccount({ name: 'Aカード', type: 'credit', initialBalance: 999 }, db);
    await repo.addAccount({ name: 'Bカード', type: 'credit' }, db);
    const accounts = await db.accounts.orderBy('sortOrder').toArray();
    expect(accounts.map((a) => a.name)).toEqual(['A銀行', 'B銀行', 'Aカード', 'Bカード']);
    expect(accounts[2].initialBalance).toBe(0);
  });

  it('名前が空の口座は登録できない', async () => {
    await expect(repo.addAccount({ name: ' ', type: 'bank' }, db)).rejects.toThrow(
      '名前を入力してください',
    );
    expect(await db.accounts.count()).toBe(0);
  });

  it('名前と初期残高を編集できる', async () => {
    const id = await repo.addAccount({ name: 'A銀行', type: 'bank', initialBalance: 120_000 }, db);
    await repo.updateAccount(id, { name: 'A銀行 普通', initialBalance: 100_000 }, db);
    expect(await db.accounts.get(id)).toMatchObject({
      name: 'A銀行 普通',
      initialBalance: 100_000,
    });
  });

  it('非表示と再表示ができ、削除関数はない', async () => {
    const id = await repo.addAccount({ name: 'Aカード', type: 'credit' }, db);
    await repo.setAccountHidden(id, true, db);
    expect((await db.accounts.get(id))?.hidden).toBe(true);
    await repo.setAccountHidden(id, false, db);
    expect((await db.accounts.get(id))?.hidden).toBe(false);
    expect('deleteAccount' in repo).toBe(false);
  });
});

describe('カテゴリ', () => {
  it('追加・名前変更・非表示ができ、削除関数はない', async () => {
    const id = await repo.addCategory({ kind: 'expense', name: 'サブスク' }, db);
    await repo.renameCategory(id, '定額サービス', db);
    await repo.setCategoryHidden(id, true, db);
    expect(await db.categories.get(id)).toMatchObject({ name: '定額サービス', hidden: true });
    expect('deleteCategory' in repo).toBe(false);
  });

  it('同じ種別で重複した名前は登録できない', async () => {
    await repo.addCategory({ kind: 'expense', name: '食費' }, db);
    await expect(repo.addCategory({ kind: 'expense', name: '食費' }, db)).rejects.toThrow(
      '同じ名前がすでにあります',
    );
    await expect(repo.addCategory({ kind: 'income', name: '食費' }, db)).resolves.toBeTypeOf(
      'string',
    );
  });

  it('自分自身と同じ名前への変更は重複扱いしない', async () => {
    const id = await repo.addCategory({ kind: 'expense', name: '食費' }, db);
    await expect(repo.renameCategory(id, '食費', db)).resolves.toBeUndefined();
  });
});

describe('予算', () => {
  it('予算を設定し、同じ月は上書きする', async () => {
    const food = await repo.addCategory({ kind: 'expense', name: '食費' }, db);
    await repo.setBudget(food, '2026-10', '40,000', db);
    await repo.setBudget(food, '2026-10', '45000', db);
    await repo.setBudget(food, '2026-12', '50000', db);
    expect(await db.budgets.orderBy('[categoryId+month]').toArray()).toEqual([
      { categoryId: food, month: '2026-10', amount: 45_000 },
      { categoryId: food, month: '2026-12', amount: 50_000 },
    ]);
  });

  it.each(['0', '-100', 'abc', '', '1000000000'])('不正な予算額 "%s" は保存できない', async (v) => {
    const food = await repo.addCategory({ kind: 'expense', name: '食費' }, db);
    await expect(repo.setBudget(food, '2026-10', v, db)).rejects.toThrow(
      '予算は1〜999,999,999円の整数で入力してください',
    );
    expect(await db.budgets.count()).toBe(0);
  });

  it('予算を解除すると null の記録が残る', async () => {
    const eatOut = await repo.addCategory({ kind: 'expense', name: '外食' }, db);
    await repo.setBudget(eatOut, '2026-10', '10000', db);
    await repo.clearBudget(eatOut, '2026-10', db);
    expect(await db.budgets.toArray()).toEqual([
      { categoryId: eatOut, month: '2026-10', amount: null },
    ]);
  });

  it('収入カテゴリには設定できない', async () => {
    const salary = await repo.addCategory({ kind: 'income', name: '給与' }, db);
    await expect(repo.setBudget(salary, '2026-10', '1000', db)).rejects.toBeInstanceOf(
      repo.ValidationError,
    );
    await expect(repo.clearBudget(salary, '2026-10', db)).rejects.toBeInstanceOf(
      repo.ValidationError,
    );
  });
});

describe('取引', () => {
  async function setup() {
    const wallet = await repo.addAccount({ name: '財布', type: 'cash', initialBalance: 5_300 }, db);
    const card = await repo.addAccount({ name: 'Aカード', type: 'credit' }, db);
    const food = await repo.addCategory({ kind: 'expense', name: '食費' }, db);
    return { wallet, card, food };
  }

  it('出費を追加・更新・削除できる', async () => {
    const { wallet, food } = await setup();
    const id = await repo.saveTransaction(
      draft({ accountId: wallet, categoryId: food }),
      ' コンビニ ',
      undefined,
      db,
    );
    expect(await db.transactions.get(id)).toMatchObject({ amount: 800, memo: 'コンビニ' });

    await repo.saveTransaction(
      draft({ accountId: wallet, categoryId: food, amount: '1000' }),
      '',
      id,
      db,
    );
    const updated = await db.transactions.get(id);
    expect(updated).toMatchObject({ amount: 1_000, memo: undefined });

    await repo.deleteTransaction(id, db);
    expect(await db.transactions.count()).toBe(0);
  });

  it('不正な入力は保存されない', async () => {
    const { card, food } = await setup();
    await expect(
      repo.saveTransaction(
        draft({ type: 'income', accountId: card, categoryId: food }),
        '',
        undefined,
        db,
      ),
    ).rejects.toBeInstanceOf(repo.ValidationError);
    expect(await db.transactions.count()).toBe(0);
  });

  it('残高調整は差額を保存し、残高が実際の値になる', async () => {
    const { wallet } = await setup();
    const id = await repo.saveTransaction(
      draft({ type: 'adjustment', accountId: wallet, amount: '5000' }),
      '',
      undefined,
      db,
    );
    expect((await db.transactions.get(id))?.amount).toBe(-300);
    const account = (await db.accounts.get(wallet))!;
    expect(computeBalance(account, await db.transactions.toArray())).toBe(5_000);
  });
});
