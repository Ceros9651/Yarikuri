import { computeAdjustmentAmount } from '../domain/balance';
import type { Account, AccountType, Category, CategoryKind, Transaction } from '../domain/types';
import {
  parseAmount,
  parseBalance,
  validateName,
  validateTransaction,
  type TransactionDraft,
  type TransactionErrors,
} from '../domain/validation';
import { db as defaultDb, type YarikuriDB } from './db';

export class ValidationError extends Error {
  readonly fields: TransactionErrors;

  constructor(message: string, fields: TransactionErrors = {}) {
    super(message);
    this.name = 'ValidationError';
    this.fields = fields;
  }
}

function assertValid(error: string | null): void {
  if (error) throw new ValidationError(error);
}

// ---- 口座（削除はできず、非表示のみ） ----

export async function addAccount(
  input: { name: string; type: AccountType; initialBalance?: number },
  db: YarikuriDB = defaultDb,
): Promise<string> {
  assertValid(validateName(input.name));
  const account: Account = {
    id: crypto.randomUUID(),
    name: input.name.trim(),
    type: input.type,
    initialBalance: input.type === 'credit' ? 0 : (input.initialBalance ?? 0),
    hidden: false,
    sortOrder: ((await db.accounts.orderBy('sortOrder').last())?.sortOrder ?? -1) + 1,
    createdAt: new Date().toISOString(),
  };
  await db.accounts.add(account);
  return account.id;
}

export async function updateAccount(
  id: string,
  changes: { name: string; initialBalance?: number },
  db: YarikuriDB = defaultDb,
): Promise<void> {
  assertValid(validateName(changes.name));
  const account = await db.accounts.get(id);
  if (!account) throw new Error('口座が見つかりません');
  await db.accounts.update(id, {
    name: changes.name.trim(),
    initialBalance:
      account.type === 'credit' ? 0 : (changes.initialBalance ?? account.initialBalance),
  });
}

export async function setAccountHidden(
  id: string,
  hidden: boolean,
  db: YarikuriDB = defaultDb,
): Promise<void> {
  await db.accounts.update(id, { hidden });
}

// ---- カテゴリ（削除はできず、非表示のみ） ----

async function namesOfKind(kind: CategoryKind, excludeId: string | undefined, db: YarikuriDB) {
  const categories = await db.categories.where('kind').equals(kind).toArray();
  return categories.filter((c) => c.id !== excludeId).map((c) => c.name);
}

export async function addCategory(
  input: { kind: CategoryKind; name: string },
  db: YarikuriDB = defaultDb,
): Promise<string> {
  assertValid(validateName(input.name, await namesOfKind(input.kind, undefined, db)));
  const category: Category = {
    id: crypto.randomUUID(),
    kind: input.kind,
    name: input.name.trim(),
    hidden: false,
    sortOrder: ((await db.categories.orderBy('sortOrder').last())?.sortOrder ?? -1) + 1,
  };
  await db.categories.add(category);
  return category.id;
}

export async function renameCategory(
  id: string,
  name: string,
  db: YarikuriDB = defaultDb,
): Promise<void> {
  const category = await db.categories.get(id);
  if (!category) throw new Error('カテゴリが見つかりません');
  assertValid(validateName(name, await namesOfKind(category.kind, id, db)));
  await db.categories.update(id, { name: name.trim() });
}

export async function setCategoryHidden(
  id: string,
  hidden: boolean,
  db: YarikuriDB = defaultDb,
): Promise<void> {
  await db.categories.update(id, { hidden });
}

// ---- 取引 ----

/**
 * 入力フォームの内容を検証して取引を保存する。id を渡すと既存の取引を更新する。
 * 残高調整では draft.amount を「実際の残高」として受け取り、差額を計算して保存する。
 */
export async function saveTransaction(
  draft: TransactionDraft,
  memo: string,
  id?: string,
  db: YarikuriDB = defaultDb,
): Promise<string> {
  return db.transaction('rw', db.accounts, db.transactions, async () => {
    const accounts = await db.accounts.toArray();
    const errors = validateTransaction(draft, accounts);
    if (Object.keys(errors).length > 0) {
      throw new ValidationError('入力内容を確認してください', errors);
    }

    let amount: number;
    if (draft.type === 'adjustment') {
      const account = accounts.find((a) => a.id === draft.accountId)!;
      const transactions = await db.transactions.where('date').belowOrEqual(draft.date).toArray();
      amount = computeAdjustmentAmount(
        account,
        transactions,
        draft.date,
        parseBalance(draft.amount)!,
        id,
      );
    } else {
      amount = parseAmount(draft.amount)!;
    }

    const now = new Date().toISOString();
    const existing = id ? await db.transactions.get(id) : undefined;
    if (id && !existing) throw new Error('取引が見つかりません');
    const tx: Transaction = {
      id: id ?? crypto.randomUUID(),
      type: draft.type,
      date: draft.date,
      amount,
      accountId: draft.accountId,
      toAccountId: draft.type === 'transfer' ? draft.toAccountId : undefined,
      categoryId:
        draft.type === 'income' || draft.type === 'expense' ? draft.categoryId : undefined,
      memo: memo.trim() || undefined,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await db.transactions.put(tx);
    return tx.id;
  });
}

export async function deleteTransaction(id: string, db: YarikuriDB = defaultDb): Promise<void> {
  await db.transactions.delete(id);
}
