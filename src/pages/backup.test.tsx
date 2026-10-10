import { fireEvent, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { exportData, importData } from '../db/backup';
import { YarikuriDB } from '../db/db';
import { addAccount, clearBudget, saveTransaction, setBudget } from '../db/repository';
import { ensureSeeded } from '../db/seed';
import { createBackup, parseBackup } from '../domain/backup';
import { db, renderApp, resetDb, screen, waitFor } from '../test/render';

/** 設定画面には他にも status があるので、バックアップ欄の中のものを探す */
const backupStatus = () =>
  within(screen.getByRole('region', { name: 'バックアップ' })).findByRole('status');

async function populate(target: YarikuriDB = db) {
  await ensureSeeded(target);
  const wallet = (await target.accounts.toArray())[0].id;
  const bank = await addAccount({ name: 'A銀行', type: 'bank', initialBalance: 80_000 }, target);
  const card = await addAccount({ name: 'Aカード', type: 'credit' }, target);
  const cats = await target.categories.toArray();
  const food = cats.find((c) => c.name === '食費')!.id;
  const salary = cats.find((c) => c.name === '給与')!.id;
  const base = { toAccountId: '', categoryId: '' };
  await saveTransaction(
    {
      ...base,
      type: 'income',
      date: '2026-10-01',
      amount: '250000',
      accountId: bank,
      categoryId: salary,
    },
    '給料',
    undefined,
    target,
  );
  await saveTransaction(
    {
      ...base,
      type: 'expense',
      date: '2026-10-02',
      amount: '1200',
      accountId: card,
      categoryId: food,
    },
    '',
    undefined,
    target,
  );
  await saveTransaction(
    {
      ...base,
      type: 'transfer',
      date: '2026-10-03',
      amount: '20000',
      accountId: bank,
      toAccountId: wallet,
    },
    '',
    undefined,
    target,
  );
  await saveTransaction(
    { ...base, type: 'adjustment', date: '2026-10-04', amount: '19500', accountId: wallet },
    '',
    undefined,
    target,
  );
  await setBudget(food, '2026-10', '40000', target);
  await clearBudget(food, '2026-12', target);
}

function backupFile(content: string, name = 'yarikuri-backup.json') {
  return new File([content], name, { type: 'application/json' });
}

async function chooseFile(file: File) {
  const input = screen.getByLabelText('バックアップファイルを選ぶ');
  fireEvent.change(input, { target: { files: [file] } });
}

beforeEach(resetDb);
afterEach(() => vi.restoreAllMocks());

describe('エクスポートとインポートの往復', () => {
  it('別の端末（空の DB）に移行すると同じ内容になる', async () => {
    await populate();
    const exported = await exportData();
    const text = JSON.stringify(createBackup(exported));

    const other = new YarikuriDB('other-device');
    try {
      const parsed = parseBackup(text);
      if (!parsed.ok) throw new Error(parsed.error);
      await importData(parsed.data, other);
      expect(await exportData(other)).toEqual(exported);
      expect(exported.budgets).toHaveLength(2);
    } finally {
      await other.delete();
    }
  });
});

describe('バックアップ画面', () => {
  it('エクスポートするとファイルを保存し、最終エクスポート日時を表示する', async () => {
    await populate();
    const createObjectURL = vi.fn<(blob: Blob) => string>(() => 'blob:backup');
    // jsdom には createObjectURL がないので、このテストの間だけ用意する
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = vi.fn();
    onTestFinished(() => {
      Reflect.deleteProperty(URL, 'createObjectURL');
      Reflect.deleteProperty(URL, 'revokeObjectURL');
    });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    const { user } = await renderApp('/settings');
    expect(screen.getByTestId('last-exported')).toHaveTextContent('まだ書き出していません');
    await user.click(screen.getByRole('button', { name: 'エクスポート' }));

    await waitFor(() => expect(click).toHaveBeenCalled());
    const blob = createObjectURL.mock.calls[0][0] as File;
    expect(blob.name).toMatch(/^yarikuri-backup-\d{4}-\d{2}-\d{2}\.json$/);
    const parsed = parseBackup(await blob.text());
    expect(parsed.ok && parsed.data.transactions).toHaveLength(4);
    expect(parsed.ok && parsed.data.budgets).toHaveLength(2);
    await waitFor(() =>
      expect(screen.getByTestId('last-exported')).not.toHaveTextContent('まだ書き出していません'),
    );
    expect(await db.meta.get('lastExportedAt')).toBeDefined();
  });

  it('確認して置き換えると、ファイルの内容で復元される', async () => {
    const source = new YarikuriDB('source-device');
    await populate(source);
    const text = JSON.stringify(createBackup(await exportData(source)));
    const expected = await exportData(source);
    await source.delete();

    await ensureSeeded();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await renderApp('/settings');
    await chooseFile(backupFile(text));

    expect(await backupStatus()).toHaveTextContent('バックアップから復元しました');
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('取引4件・予算2件'));
    expect(await exportData()).toEqual(expected);
  });

  it('予算を含まない旧形式のファイルを読み込むと、予算なしで復元される', async () => {
    const source = new YarikuriDB('old-device');
    await populate(source);
    const { budgets: _omit, ...data } = await exportData(source);
    void _omit;
    await source.delete();
    const v1 = { ...createBackup({ ...data, budgets: [] }), version: 1 };
    Reflect.deleteProperty(v1, 'budgets');

    await populate();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await renderApp('/settings');
    await chooseFile(backupFile(JSON.stringify(v1)));

    expect(await backupStatus()).toHaveTextContent('バックアップから復元しました');
    const after = await exportData();
    expect(after.transactions).toEqual(data.transactions);
    expect(after.budgets).toEqual([]);
  });

  it('存在しないカテゴリの予算を含むファイルはエラーを表示し、データは変わらない', async () => {
    await populate();
    const before = await exportData();
    const broken = createBackup({
      ...before,
      budgets: [{ categoryId: 'no-such', month: '2026-10', amount: 1000 }],
    });
    const confirm = vi.spyOn(window, 'confirm');
    await renderApp('/settings');
    await chooseFile(backupFile(JSON.stringify(broken)));

    expect(await backupStatus()).toHaveTextContent(
      '読み込めませんでした：存在しない出費カテゴリを参照している予算があります',
    );
    expect(confirm).not.toHaveBeenCalled();
    expect(await exportData()).toEqual(before);
  });

  it('上書き確認でキャンセルするとデータは変わらない', async () => {
    await populate();
    const before = await exportData();
    const other = { ...before, transactions: [] };
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    await renderApp('/settings');
    await chooseFile(backupFile(JSON.stringify(createBackup(other))));

    await waitFor(() => expect(window.confirm).toHaveBeenCalled());
    expect(await exportData()).toEqual(before);
  });

  it('壊れたファイルはエラーを表示し、データは変わらない', async () => {
    await populate();
    const before = await exportData();
    const confirm = vi.spyOn(window, 'confirm');
    await renderApp('/settings');
    await chooseFile(backupFile('{ broken'));

    expect(await backupStatus()).toHaveTextContent(
      '読み込めませんでした：JSONとして読み込めないファイルです',
    );
    expect(confirm).not.toHaveBeenCalled();
    expect(await exportData()).toEqual(before);
  });
});
