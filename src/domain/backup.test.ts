import { describe, expect, it } from 'vitest';
import { backupFileName, createBackup, parseBackup, type BackupData } from './backup';
import { makeAccount, makeCategory, makeTx } from '../test/factories';

function sampleData(): BackupData {
  const wallet = makeAccount('財布', 'cash', 1_000);
  const bank = makeAccount('A銀行', 'bank', 50_000);
  const card = makeAccount('Aカード', 'credit', 0, { hidden: true });
  const food = makeCategory('食費');
  const salary = makeCategory('給与', 'income');
  return {
    accounts: [wallet, bank, card],
    categories: [food, salary],
    transactions: [
      makeTx({ type: 'income', amount: 1_000, accountId: bank.id, categoryId: salary.id }),
      makeTx({
        type: 'expense',
        amount: 500,
        accountId: card.id,
        categoryId: food.id,
        memo: 'ランチ',
      }),
      makeTx({ type: 'transfer', amount: 300, accountId: bank.id, toAccountId: wallet.id }),
      makeTx({ type: 'adjustment', amount: -20, accountId: wallet.id }),
    ],
    budgets: [
      { categoryId: food.id, month: '2026-10', amount: 40_000 },
      { categoryId: food.id, month: '2026-12', amount: null },
    ],
  };
}

describe('エクスポート', () => {
  it('形式・バージョン・エクスポート日時と全データを含む', () => {
    const data = sampleData();
    const backup = createBackup(data, new Date('2026-10-09T03:00:00Z'));
    expect(backup).toMatchObject({
      format: 'yarikuri-backup',
      version: 2,
      exportedAt: '2026-10-09T03:00:00.000Z',
    });
    expect(backup.transactions).toHaveLength(4);
    expect(backup.budgets).toHaveLength(2);
  });

  it('ファイル名にエクスポート日付を含める', () => {
    expect(backupFileName(new Date(2026, 9, 9, 12))).toBe('yarikuri-backup-2026-10-09.json');
  });

  it('JSON にして読み戻すと元のデータと一致する', () => {
    const data = sampleData();
    const result = parseBackup(JSON.stringify(createBackup(data)));
    expect(result).toEqual({ ok: true, data });
  });
});

describe('予算を含まない旧形式（version 1）', () => {
  it('予算なしとして読み込める', () => {
    const { budgets: _omit, ...v1 } = { ...createBackup(sampleData()), version: 1 };
    void _omit;
    const result = parseBackup(JSON.stringify(v1));
    expect(result.ok && result.data.budgets).toEqual([]);
    expect(result.ok && result.data.transactions).toHaveLength(4);
  });
});

describe('不正なファイルの拒否', () => {
  const valid = () => createBackup(sampleData()) as unknown as Record<string, unknown>;
  const errorOf = (text: string) => {
    const result = parseBackup(text);
    return result.ok ? null : result.error;
  };

  it('JSON として読めない', () => {
    expect(errorOf('{ broken')).toBe('JSONとして読み込めないファイルです');
  });

  it('Yarikuri のファイルではない', () => {
    expect(errorOf(JSON.stringify({ hello: 'world' }))).toBe(
      'Yarikuriのバックアップファイルではありません',
    );
    expect(errorOf('[]')).toBe('Yarikuriのバックアップファイルではありません');
  });

  it('対応していないバージョン', () => {
    expect(errorOf(JSON.stringify({ ...valid(), version: 3 }))).toBe(
      '対応していないバージョンのファイルです（version: 3）',
    );
  });

  it('必要な項目がない', () => {
    const { transactions: _omit, ...rest } = valid();
    void _omit;
    expect(errorOf(JSON.stringify(rest))).toBe(
      '必要な項目が不足しているか、形式が正しくありません',
    );
    const data = valid();
    (data.accounts as Record<string, unknown>[])[0].type = 'unknown';
    expect(errorOf(JSON.stringify(data))).toBe(
      '必要な項目が不足しているか、形式が正しくありません',
    );
  });

  it('存在しない口座・カテゴリを参照している', () => {
    const missingAccount = sampleData();
    missingAccount.accounts = missingAccount.accounts.filter((a) => a.name !== 'A銀行');
    expect(errorOf(JSON.stringify(createBackup(missingAccount)))).toBe(
      '存在しない口座またはカテゴリを参照している取引があります',
    );

    const missingCategory = sampleData();
    missingCategory.categories = [];
    expect(errorOf(JSON.stringify(createBackup(missingCategory)))).toBe(
      '存在しない口座またはカテゴリを参照している取引があります',
    );
  });

  it('version 2 で予算の項目がない', () => {
    const { budgets: _omit, ...rest } = valid();
    void _omit;
    expect(errorOf(JSON.stringify(rest))).toBe(
      '必要な項目が不足しているか、形式が正しくありません',
    );
  });

  it.each([
    ['月の形式が不正', { month: '2026-13' }],
    ['金額が 0', { amount: 0 }],
    ['金額が小数', { amount: 1.5 }],
  ])('予算の形式が不正（%s）', (_label, change) => {
    const data = valid();
    Object.assign((data.budgets as Record<string, unknown>[])[0], change);
    expect(errorOf(JSON.stringify(data))).toBe(
      '必要な項目が不足しているか、形式が正しくありません',
    );
  });

  it('存在しない出費カテゴリを参照する予算', () => {
    const missing = sampleData();
    missing.budgets.push({ categoryId: 'no-such', month: '2026-10', amount: 1 });
    expect(errorOf(JSON.stringify(createBackup(missing)))).toBe(
      '存在しない出費カテゴリを参照している予算があります',
    );

    const income = sampleData();
    const salary = income.categories.find((c) => c.kind === 'income')!;
    income.budgets.push({ categoryId: salary.id, month: '2026-10', amount: 1 });
    expect(errorOf(JSON.stringify(createBackup(income)))).toBe(
      '存在しない出費カテゴリを参照している予算があります',
    );
  });

  it('同じカテゴリと月の予算が重複している', () => {
    const dup = sampleData();
    dup.budgets.push({ ...dup.budgets[0], amount: 1 });
    expect(errorOf(JSON.stringify(createBackup(dup)))).toBe(
      '同じカテゴリと月の予算が重複しています',
    );
  });
});
