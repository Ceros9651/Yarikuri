import { useState, type FormEvent } from 'react';
import { computeBalance } from '../domain/balance';
import { todayString } from '../domain/date';
import { formatYen } from '../domain/format';
import {
  TRANSACTION_TYPE_LABELS,
  type Account,
  type Category,
  type Transaction,
  type TransactionType,
} from '../domain/types';
import { canUseAccount, type TransactionErrors } from '../domain/validation';
import { getBudgetAlert, saveTransaction, ValidationError } from '../db/repository';
import type { BudgetAlert } from '../domain/budget';
import { useAccounts, useCategories, useTransactions } from '../hooks/useData';

const TYPE_ORDER: TransactionType[] = ['expense', 'income', 'transfer', 'adjustment'];

const FROM_LABELS: Record<TransactionType, string> = {
  expense: '支払元',
  income: '入金先',
  transfer: '振替元',
  adjustment: '口座',
};

interface Props {
  /** 編集する取引。新規入力では省略する */
  initial?: Transaction;
  /** 金額欄の初期値（残高調整の編集では「実際の残高」） */
  initialAmount?: string;
  /** alert は保存した出費で予算が注意・超過になったときのメッセージ */
  onSaved: (id: string, alert: BudgetAlert | null) => void;
}

/** 選択肢に id が含まれていればそれを、なければ先頭（except を除く）を選ぶ */
function pick<T extends { id: string }>(options: T[], id: string, except?: string): string {
  if (options.some((o) => o.id === id)) return id;
  return options.find((o) => o.id !== except)?.id ?? '';
}

export function TransactionForm({ initial, initialAmount, onSaved }: Props) {
  const accounts = useAccounts();
  const categories = useCategories();
  const transactions = useTransactions() ?? [];

  const [type, setType] = useState<TransactionType>(initial?.type ?? 'expense');
  const [date, setDate] = useState(initial?.date ?? todayString());
  const [amount, setAmount] = useState(initialAmount ?? (initial ? String(initial.amount) : ''));
  const [accountId, setAccountId] = useState(initial?.accountId ?? '');
  const [toAccountId, setToAccountId] = useState(initial?.toAccountId ?? '');
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? '');
  const [memo, setMemo] = useState(initial?.memo ?? '');
  const [errors, setErrors] = useState<TransactionErrors>({});
  const [saving, setSaving] = useState(false);

  // 非表示の口座・カテゴリは選択肢から外す。ただし編集中の取引が使っているものは残す
  const visibleAccount = (a: Account) =>
    !a.hidden || a.id === initial?.accountId || a.id === initial?.toAccountId;
  const fromOptions = accounts.filter((a) => visibleAccount(a) && canUseAccount(type, 'from', a));
  const toOptions = accounts.filter((a) => visibleAccount(a) && canUseAccount(type, 'to', a));
  const categoryOptions = categories.filter(
    (c: Category) => c.kind === type && (!c.hidden || c.id === initial?.categoryId),
  );

  const selectedFrom = pick(fromOptions, accountId);
  const selectedTo = pick(toOptions, toAccountId, selectedFrom);
  const selectedCategory = pick(categoryOptions, categoryId);
  const hasCategory = type === 'income' || type === 'expense';

  const adjustmentAccount = accounts.find((a) => a.id === selectedFrom);
  const currentBalance =
    type === 'adjustment' && adjustmentAccount
      ? computeBalance(adjustmentAccount, transactions, date, initial?.id)
      : null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const id = await saveTransaction(
        {
          type,
          date,
          amount,
          accountId: selectedFrom,
          toAccountId: type === 'transfer' ? selectedTo : '',
          categoryId: hasCategory ? selectedCategory : '',
        },
        memo,
        initial?.id,
      );
      setErrors({});
      onSaved(id, await getBudgetAlert(id));
    } catch (err) {
      if (err instanceof ValidationError) {
        setErrors(Object.keys(err.fields).length > 0 ? err.fields : { amount: err.message });
      } else {
        throw err;
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="segmented" role="group" aria-label="取引の種類">
        {TYPE_ORDER.map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={type === t}
            disabled={initial !== undefined && t !== type}
            onClick={() => {
              setType(t);
              setErrors({});
            }}
          >
            {TRANSACTION_TYPE_LABELS[t]}
          </button>
        ))}
      </div>

      <label className="field">
        <span>日付</span>
        <input
          type="date"
          aria-label="日付"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
        />
        {errors.date && <em className="field-error">{errors.date}</em>}
      </label>

      <label className="field">
        <span>{type === 'adjustment' ? '実際の残高' : '金額'}</span>
        <input
          type="text"
          aria-label={type === 'adjustment' ? '実際の残高' : '金額'}
          inputMode="numeric"
          autoComplete="off"
          placeholder="0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          aria-invalid={errors.amount !== undefined}
        />
        {errors.amount && (
          <em className="field-error" role="alert">
            {errors.amount}
          </em>
        )}
      </label>

      {hasCategory && (
        <label className="field">
          <span>カテゴリ</span>
          <select
            aria-label="カテゴリ"
            value={selectedCategory}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            {categoryOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {errors.categoryId && <em className="field-error">{errors.categoryId}</em>}
        </label>
      )}

      <label className="field">
        <span>{FROM_LABELS[type]}</span>
        <select
          aria-label={FROM_LABELS[type]}
          value={selectedFrom}
          onChange={(e) => setAccountId(e.target.value)}
        >
          {fromOptions.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        {errors.accountId && <em className="field-error">{errors.accountId}</em>}
        {currentBalance !== null && (
          <small className="muted">アプリ上の残高: {formatYen(currentBalance)}</small>
        )}
      </label>

      {type === 'transfer' && (
        <label className="field">
          <span>振替先</span>
          <select
            aria-label="振替先"
            value={selectedTo}
            onChange={(e) => setToAccountId(e.target.value)}
          >
            {toOptions.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          {errors.toAccountId && (
            <em className="field-error" role="alert">
              {errors.toAccountId}
            </em>
          )}
        </label>
      )}

      <label className="field">
        <span>メモ（任意）</span>
        <input
          type="text"
          aria-label="メモ"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
        />
      </label>

      <div className="form-actions">
        <button type="submit" className="primary" disabled={saving}>
          保存
        </button>
      </div>
    </form>
  );
}
