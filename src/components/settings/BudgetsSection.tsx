import { useState, type FormEvent } from 'react';
import { clearBudget, setBudget, ValidationError } from '../../db/repository';
import { findBudgetRecord } from '../../domain/budget';
import { formatMonthLabel } from '../../domain/date';
import { formatYen } from '../../domain/format';
import type { Budget, Category } from '../../domain/types';
import { useBudgets, useCategories } from '../../hooks/useData';
import { useMonth } from '../MonthContext';
import { MonthSwitcher } from '../MonthSwitcher';

function errorMessage(err: unknown): string {
  if (err instanceof ValidationError) return err.message;
  throw err;
}

/** 有効な予算と、それがこの月の設定か前の月からの引き継ぎかを表す文言 */
function describe(record: Budget | undefined, month: string): string {
  if (!record || record.amount === null) {
    return record?.month === month ? '予算なし（この月に解除）' : '予算なし';
  }
  const source =
    record.month === month ? 'この月に設定' : `${formatMonthLabel(record.month)}から引き継ぎ`;
  return `予算 ${formatYen(record.amount)}（${source}）`;
}

function BudgetRow({
  category,
  month,
  record,
}: {
  category: Category;
  month: string;
  record: Budget | undefined;
}) {
  const current = record?.amount ?? null;
  const [amount, setAmount] = useState(current === null ? '' : String(current));
  const [error, setError] = useState('');

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    try {
      await setBudget(category.id, month, amount);
      setError('');
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function handleClear() {
    await clearBudget(category.id, month);
    setAmount('');
    setError('');
  }

  return (
    <li className="budget-setting">
      <div className="budget-setting-head">
        <span className="truncate">{category.name}</span>
        <span className="muted" data-testid={`budget-source-${category.name}`}>
          {describe(record, month)}
        </span>
      </div>
      <form className="inline-form" onSubmit={handleSave} aria-label={`${category.name}の予算`}>
        <input
          aria-label={`${category.name}の予算額`}
          inputMode="numeric"
          placeholder="予算額（円）"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <button type="submit" className="primary">
          保存
        </button>
        {current !== null && (
          <button type="button" onClick={handleClear} aria-label={`${category.name}の予算を解除`}>
            解除
          </button>
        )}
      </form>
      {error && (
        <em className="field-error" role="alert">
          {error}
        </em>
      )}
    </li>
  );
}

export function BudgetsSection() {
  const { month } = useMonth();
  const categories = useCategories();
  const budgets = useBudgets();
  const expense = categories.filter((c) => c.kind === 'expense' && !c.hidden);

  return (
    <section className="card" aria-labelledby="budgets-settings-heading">
      <h2 id="budgets-settings-heading">予算</h2>
      <p className="muted">
        設定した月以降は、次に設定した月まで同じ予算が引き継がれます。予算の80%で注意、超えると超過として知らせます。
      </p>
      <MonthSwitcher />
      <ul className="list" aria-label="カテゴリ別の予算">
        {expense.map((c) => {
          const record = findBudgetRecord(c.id, month, budgets);
          return (
            <BudgetRow
              // 月や保存済みの値が変わったら入力欄を初期化する
              key={`${c.id}:${month}:${record?.month}:${record?.amount}`}
              category={c}
              month={month}
              record={record}
            />
          );
        })}
      </ul>
    </section>
  );
}
