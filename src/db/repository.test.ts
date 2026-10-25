import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { balancesAtMonthEnd, computeBalance } from '../domain/balance';
import { lastDayOfMonth } from '../domain/date';
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
      'balanceDeltas',
      'budgets',
      'categories',
      'meta',
      'outbox',
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
  it('version 2 の DB を開き直すと既存データが残り、空の outbox が使える', async () => {
    const name = `test-upgrade-${++n}`;
    const old = new Dexie(name);
    old.version(2).stores({
      accounts: 'id, type, sortOrder',
      categories: 'id, kind, sortOrder',
      transactions: 'id, date, accountId, toAccountId, categoryId',
      meta: 'key',
      budgets: '[categoryId+month], categoryId',
    });
    await old.table('budgets').add({ categoryId: 'c1', month: '2026-10', amount: 40_000 });
    old.close();

    const upgraded = new YarikuriDB(name);
    try {
      expect(await upgraded.budgets.get(['c1', '2026-10'])).toMatchObject({ amount: 40_000 });
      expect(await upgraded.outbox.count()).toBe(0);
      await upgraded.outbox.put({ table: 'budgets', docId: 'c1__2026-10', token: 't' });
      expect(await upgraded.outbox.get(['budgets', 'c1__2026-10'])).toMatchObject({ token: 't' });
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

  describe('並べ替え', () => {
    const namesOf = async (kind: 'expense' | 'income') =>
      (await db.categories.orderBy('sortOrder').toArray())
        .filter((c) => c.kind === kind)
        .map((c) => c.name);
    const idsByName = async (kind: 'expense' | 'income') => {
      const list = (await db.categories.orderBy('sortOrder').toArray()).filter(
        (c) => c.kind === kind,
      );
      return new Map(list.map((c) => [c.name, c.id]));
    };

    beforeEach(async () => {
      await ensureSeeded(db);
    });

    it('指定した順に並び、収入カテゴリの順序は変わらない', async () => {
      const incomeBefore = await db.categories.where('kind').equals('income').toArray();
      const ids = await idsByName('expense');
      const order = ['外食', ...DEFAULT_EXPENSE_CATEGORIES.filter((n) => n !== '外食')];
      await repo.reorderCategories(
        order.map((n) => ids.get(n)!),
        db,
      );
      expect(await namesOf('expense')).toEqual(order);
      expect(await db.categories.where('kind').equals('income').toArray()).toEqual(incomeBefore);
      expect(await namesOf('income')).toEqual(DEFAULT_INCOME_CATEGORIES);
    });

    it('非表示のカテゴリは再表示すると元の相対位置に戻る', async () => {
      const ids = await idsByName('expense');
      await repo.setCategoryHidden(ids.get('Amazon')!, true, db);
      const visible = DEFAULT_EXPENSE_CATEGORIES.filter((n) => n !== 'Amazon');
      const order = ['外食', ...visible.filter((n) => n !== '外食')];
      await repo.reorderCategories(
        order.map((n) => ids.get(n)!),
        db,
      );
      await repo.setCategoryHidden(ids.get('Amazon')!, false, db);
      const names = await namesOf('expense');
      expect(names[0]).toBe('外食');
      expect(names.indexOf('Amazon')).toBe(names.indexOf('趣味・娯楽') + 1);
      expect(names.indexOf('衣服')).toBe(names.indexOf('Amazon') + 1);
    });

    it('収入と出費のカテゴリを混ぜると拒否される', async () => {
      const expense = await idsByName('expense');
      const income = await idsByName('income');
      await expect(
        repo.reorderCategories([income.get('給与')!, expense.get('食費')!], db),
      ).rejects.toThrow('混ぜて並べ替えられません');
    });

    it('存在しないカテゴリは拒否される', async () => {
      await expect(repo.reorderCategories(['missing'], db)).rejects.toThrow(
        'カテゴリが見つかりません',
      );
    });
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

  /** 増減の表から求めた月末の残高と、全取引から求めた残高 */
  async function monthEndBalance(accountId: string, month: string) {
    const account = (await db.accounts.get(accountId))!;
    const fromDeltas = balancesAtMonthEnd([account], await db.balanceDeltas.toArray(), month).get(
      accountId,
    );
    const fromAll = computeBalance(account, await db.transactions.toArray(), lastDayOfMonth(month));
    expect(fromDeltas).toBe(fromAll);
    return fromDeltas;
  }

  it('過去の月の取引を編集・削除すると、以後の月末の残高が変わる', async () => {
    const { wallet, food } = await setup();
    const old = await repo.saveTransaction(
      draft({ date: '2024-03-10', accountId: wallet, categoryId: food, amount: '1000' }),
      '',
      undefined,
      db,
    );
    await repo.saveTransaction(
      draft({ date: '2026-10-05', accountId: wallet, categoryId: food, amount: '300' }),
      '',
      undefined,
      db,
    );
    expect(await monthEndBalance(wallet, '2026-10')).toBe(4_000);

    await repo.saveTransaction(
      draft({ date: '2024-03-10', accountId: wallet, categoryId: food, amount: '1500' }),
      '',
      old,
      db,
    );
    expect(await monthEndBalance(wallet, '2024-03')).toBe(3_800);
    expect(await monthEndBalance(wallet, '2026-10')).toBe(3_500);

    await repo.deleteTransaction(old, db);
    expect(await monthEndBalance(wallet, '2024-03')).toBe(5_300);
    expect(await monthEndBalance(wallet, '2026-10')).toBe(5_000);
  });

  it('残高調整の日付を前の月から移す編集でも、調整自身を除いて差額を出し直す', async () => {
    const { wallet, food } = await setup();
    await repo.saveTransaction(
      draft({ date: '2026-09-01', accountId: wallet, categoryId: food, amount: '300' }),
      '',
      undefined,
      db,
    );
    const id = await repo.saveTransaction(
      draft({ type: 'adjustment', date: '2026-09-20', accountId: wallet, amount: '4000' }),
      '',
      undefined,
      db,
    );
    expect((await db.transactions.get(id))?.amount).toBe(-1_000);

    await repo.saveTransaction(
      draft({ type: 'adjustment', date: '2026-10-10', accountId: wallet, amount: '4500' }),
      '',
      id,
      db,
    );
    expect((await db.transactions.get(id))?.amount).toBe(-500);
    expect(await monthEndBalance(wallet, '2026-09')).toBe(5_000);
    expect(await monthEndBalance(wallet, '2026-10')).toBe(4_500);
  });

  it('予算のアラートは保存した取引の月の出費だけで判定する', async () => {
    const { wallet, food } = await setup();
    await repo.setBudget(food, '2026-01', '1000', db);
    // 前の月の出費は含めない
    await repo.saveTransaction(
      draft({ date: '2026-09-30', accountId: wallet, categoryId: food, amount: '900' }),
      '',
      undefined,
      db,
    );
    const first = await repo.saveTransaction(
      draft({ date: '2026-10-01', accountId: wallet, categoryId: food, amount: '700' }),
      '',
      undefined,
      db,
    );
    expect(await repo.getBudgetAlert(first, db)).toBeNull();

    const second = await repo.saveTransaction(
      draft({ date: '2026-10-31', accountId: wallet, categoryId: food, amount: '100' }),
      '',
      undefined,
      db,
    );
    expect(await repo.getBudgetAlert(second, db)).toMatchObject({ status: 'warning' });

    const third = await repo.saveTransaction(
      draft({ date: '2026-10-15', accountId: wallet, categoryId: food, amount: '201' }),
      '',
      undefined,
      db,
    );
    expect(await repo.getBudgetAlert(third, db)).toMatchObject({
      status: 'over',
      message: '食費が予算を超過しました（¥1,001 / ¥1,000）',
    });
  });
});

describe('送れていない変更の記録（outbox）', () => {
  const outbox = async () => (await db.outbox.toArray()).map((e) => `${e.table}/${e.docId}`).sort();

  async function seeded() {
    await ensureSeeded(db);
    await db.outbox.clear();
    const wallet = (await db.accounts.toArray())[0].id;
    const food = (await db.categories.toArray()).find((c) => c.name === '食費')!.id;
    return { wallet, food };
  }

  it('初期データの投入で「財布」と初期カテゴリが積まれる', async () => {
    await ensureSeeded(db);
    const entries = await outbox();
    expect(entries.filter((e) => e.startsWith('accounts/'))).toHaveLength(1);
    expect(entries.filter((e) => e.startsWith('categories/'))).toHaveLength(
      DEFAULT_EXPENSE_CATEGORIES.length + DEFAULT_INCOME_CATEGORIES.length,
    );
  });

  it('口座の追加・変更・非表示で、その口座が1件積まれる', async () => {
    await seeded();
    const bank = await repo.addAccount({ name: 'A銀行', type: 'bank' }, db);
    await repo.updateAccount(bank, { name: 'B銀行', initialBalance: 100 }, db);
    await repo.setAccountHidden(bank, true, db);
    expect(await outbox()).toEqual([`accounts/${bank}`]);
  });

  it('カテゴリの追加・名前変更・非表示・並べ替えで、そのカテゴリが積まれる', async () => {
    await seeded();
    const added = await repo.addCategory({ kind: 'expense', name: '医療' }, db);
    await repo.renameCategory(added, '病院', db);
    await repo.setCategoryHidden(added, true, db);
    expect(await outbox()).toEqual([`categories/${added}`]);

    await db.outbox.clear();
    const expense = await db.categories.where('kind').equals('expense').sortBy('sortOrder');
    const [a, b] = expense;
    await repo.reorderCategories([b.id, a.id], db);
    expect(await outbox()).toEqual([`categories/${a.id}`, `categories/${b.id}`].sort());
  });

  it('予算の設定・解除で、その月の予算が積まれる', async () => {
    const { food } = await seeded();
    await repo.setBudget(food, '2026-10', '40000', db);
    await repo.clearBudget(food, '2026-11', db);
    expect(await outbox()).toEqual([`budgets/${food}__2026-10`, `budgets/${food}__2026-11`]);
  });

  it('同じ取引を2回保存しても1件で、token が変わる', async () => {
    const { wallet, food } = await seeded();
    const id = await repo.saveTransaction(
      draft({ accountId: wallet, categoryId: food }),
      '',
      undefined,
      db,
    );
    const first = await db.outbox.get(['transactions', id]);
    await repo.saveTransaction(
      draft({ accountId: wallet, categoryId: food, amount: '900' }),
      '',
      id,
      db,
    );
    const second = await db.outbox.get(['transactions', id]);
    expect(await outbox()).toEqual([`transactions/${id}`]);
    expect(second!.token).not.toBe(first!.token);
  });

  it('取引を削除しても outbox に残る', async () => {
    const { wallet, food } = await seeded();
    const id = await repo.saveTransaction(
      draft({ accountId: wallet, categoryId: food }),
      '',
      undefined,
      db,
    );
    await repo.deleteTransaction(id, db);
    expect(await db.transactions.get(id)).toBeUndefined();
    expect(await outbox()).toEqual([`transactions/${id}`]);
  });

  it('入力エラーで保存しなかったときは積まない', async () => {
    await seeded();
    await expect(repo.saveTransaction(draft({}), '', undefined, db)).rejects.toThrow();
    expect(await outbox()).toEqual([]);
  });
});
