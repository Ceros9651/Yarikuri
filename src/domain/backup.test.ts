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
  };
}

describe('エクスポート', () => {
  it('形式・バージョン・エクスポート日時と全データを含む', () => {
    const data = sampleData();
    const backup = createBackup(data, new Date('2026-10-09T03:00:00Z'));
    expect(backup).toMatchObject({
      format: 'yarikuri-backup',
      version: 1,
      exportedAt: '2026-10-09T03:00:00.000Z',
    });
    expect(backup.transactions).toHaveLength(4);
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
    expect(errorOf(JSON.stringify({ ...valid(), version: 2 }))).toBe(
      '対応していないバージョンのファイルです（version: 2）',
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
});
