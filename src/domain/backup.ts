import { z } from 'zod';
import { todayString } from './date';
import { MAX_AMOUNT } from './validation';
import type { Account, Budget, Category, Transaction } from './types';

export const BACKUP_FORMAT = 'yarikuri-backup';
export const BACKUP_VERSION = 2;
/** インポートできるバージョン。version 1 は予算を含まない */
const SUPPORTED_VERSIONS: readonly unknown[] = [1, BACKUP_VERSION];

export interface BackupData {
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  budgets: Budget[];
}

export interface Backup extends BackupData {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  exportedAt: string;
}

const accountSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(['cash', 'bank', 'emoney', 'credit']),
  initialBalance: z.number().int(),
  hidden: z.boolean(),
  sortOrder: z.number(),
  createdAt: z.string(),
});

const categorySchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['income', 'expense']),
  name: z.string().min(1),
  hidden: z.boolean(),
  sortOrder: z.number(),
});

const transactionSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['income', 'expense', 'transfer', 'adjustment']),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.number().int(),
  accountId: z.string().min(1),
  toAccountId: z.string().optional(),
  categoryId: z.string().optional(),
  memo: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const budgetSchema = z.object({
  categoryId: z.string().min(1),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  amount: z.number().int().min(1).max(MAX_AMOUNT).nullable(),
});

const backupSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  version: z.union([z.literal(1), z.literal(BACKUP_VERSION)]),
  exportedAt: z.string(),
  accounts: z.array(accountSchema),
  categories: z.array(categorySchema),
  transactions: z.array(transactionSchema),
  // version 1 のファイルには無い
  budgets: z.array(budgetSchema).optional(),
});

export function createBackup(data: BackupData, now: Date = new Date()): Backup {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    accounts: data.accounts,
    categories: data.categories,
    transactions: data.transactions,
    budgets: data.budgets,
  };
}

export function backupFileName(now: Date = new Date()): string {
  return `yarikuri-backup-${todayString(now)}.json`;
}

export type ParseResult = { ok: true; data: BackupData } | { ok: false; error: string };

/** バックアップファイルの中身を検証する。問題があれば理由を返し、データは返さない */
export function parseBackup(text: string): ParseResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: 'JSONとして読み込めないファイルです' };
  }
  if (
    typeof json !== 'object' ||
    json === null ||
    !('format' in json) ||
    json.format !== BACKUP_FORMAT
  ) {
    return { ok: false, error: 'Yarikuriのバックアップファイルではありません' };
  }
  if (!('version' in json) || !SUPPORTED_VERSIONS.includes(json.version)) {
    const version = 'version' in json ? String(json.version) : '不明';
    return { ok: false, error: `対応していないバージョンのファイルです（version: ${version}）` };
  }

  const parsed = backupSchema.safeParse(json);
  if (!parsed.success) {
    return { ok: false, error: '必要な項目が不足しているか、形式が正しくありません' };
  }
  const { accounts, categories, transactions } = parsed.data;
  const budgets = parsed.data.version === 1 ? [] : (parsed.data.budgets ?? []);
  if (parsed.data.version === BACKUP_VERSION && !parsed.data.budgets) {
    return { ok: false, error: '必要な項目が不足しているか、形式が正しくありません' };
  }

  const accountIds = new Set(accounts.map((a) => a.id));
  const categoryIds = new Set(categories.map((c) => c.id));
  const brokenReference = transactions.some(
    (tx) =>
      !accountIds.has(tx.accountId) ||
      (tx.type === 'transfer' && !accountIds.has(tx.toAccountId ?? '')) ||
      ((tx.type === 'income' || tx.type === 'expense') && !categoryIds.has(tx.categoryId ?? '')),
  );
  if (brokenReference) {
    return { ok: false, error: '存在しない口座またはカテゴリを参照している取引があります' };
  }

  const expenseCategoryIds = new Set(
    categories.filter((c) => c.kind === 'expense').map((c) => c.id),
  );
  if (budgets.some((b) => !expenseCategoryIds.has(b.categoryId))) {
    return { ok: false, error: '存在しない出費カテゴリを参照している予算があります' };
  }
  const budgetKeys = new Set(budgets.map((b) => `${b.categoryId}:${b.month}`));
  if (budgetKeys.size !== budgets.length) {
    return { ok: false, error: '同じカテゴリと月の予算が重複しています' };
  }

  return { ok: true, data: { accounts, categories, transactions, budgets } };
}
