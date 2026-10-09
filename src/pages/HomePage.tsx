import { Link } from 'react-router-dom';
import { useMonth } from '../components/MonthContext';
import { MonthSwitcher } from '../components/MonthSwitcher';
import { computeBalances } from '../domain/balance';
import { BUDGET_STATUS_LABELS, summarizeBudgets } from '../domain/budget';
import { lastDayOfMonth } from '../domain/date';
import { formatYen } from '../domain/format';
import { summarizeMonth } from '../domain/summary';
import { isAssetAccount } from '../domain/types';
import { useAllData } from '../hooks/useData';

export function HomePage() {
  const { month } = useMonth();
  const data = useAllData();
  if (!data) {
    return (
      <>
        <h1>ホーム</h1>
        <MonthSwitcher />
      </>
    );
  }
  const { accounts, categories, transactions, budgets } = data;

  const summary = summarizeMonth(month, transactions, accounts, categories);
  const budgetUsages = summarizeBudgets(month, transactions, accounts, categories, budgets);
  const overBudget = budgetUsages.filter((b) => b.status === 'over');
  const assetAccounts = accounts.filter((a) => isAssetAccount(a) && !a.hidden);
  const balances = computeBalances(assetAccounts, transactions, lastDayOfMonth(month));
  const totalBalance = [...balances.values()].reduce((sum, b) => sum + b, 0);

  return (
    <>
      <h1>ホーム</h1>
      <MonthSwitcher />

      {overBudget.length > 0 && (
        <p className="notice budget-alert" role="alert" data-testid="over-budget">
          予算超過：{overBudget.map((b) => b.name).join('、')}
        </p>
      )}

      <section className="summary-grid" aria-label="月の収支">
        <div className="card">
          <span className="muted">収入</span>
          <span className="amount income" data-testid="income">
            {formatYen(summary.income)}
          </span>
        </div>
        <div className="card">
          <span className="muted">出費</span>
          <span className="amount expense" data-testid="expense">
            {formatYen(summary.expense)}
          </span>
        </div>
        <div className="card">
          <span className="muted">差額</span>
          <span className="amount" data-testid="net">
            {formatYen(summary.net)}
          </span>
        </div>
      </section>

      <section className="card" aria-labelledby="balances-heading">
        <h2 id="balances-heading">残高（月末時点）</h2>
        <ul className="list">
          {assetAccounts.map((a) => (
            <li key={a.id}>
              <span className="truncate">{a.name}</span>
              <span className="amount">{formatYen(balances.get(a.id) ?? 0)}</span>
            </li>
          ))}
          <li className="row-total">
            <span>合計</span>
            <span className="amount" data-testid="balance-total">
              {formatYen(totalBalance)}
            </span>
          </li>
        </ul>
      </section>

      <section className="card" aria-labelledby="categories-heading">
        <h2 id="categories-heading">カテゴリ別の出費</h2>
        {summary.byCategory.length === 0 ? (
          <p className="empty">この月の出費はありません</p>
        ) : (
          <ul className="list">
            {summary.byCategory.map((c) => (
              <li key={c.categoryId} className="bar-row">
                <span className="truncate">{c.name}</span>
                <span className="amount">
                  {formatYen(c.amount)}（{c.percent}%）
                </span>
                <span className="bar-track" aria-hidden="true">
                  <span className="bar-fill" style={{ width: `${c.percent}%`, display: 'block' }} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card" aria-labelledby="budgets-heading">
        <h2 id="budgets-heading">予算</h2>
        {budgetUsages.length === 0 ? (
          <p className="empty">
            この月の予算はありません。<Link to="/settings">設定</Link>
            でカテゴリごとに予算を決められます
          </p>
        ) : (
          <ul className="list">
            {budgetUsages.map((b) => (
              <li
                key={b.categoryId}
                className={`bar-row budget-${b.status}`}
                data-testid={`budget-${b.name}`}
              >
                <span className="budget-head">
                  <span className="truncate">{b.name}</span>
                  {b.status !== 'normal' && (
                    <span className="budget-badge">{BUDGET_STATUS_LABELS[b.status]}</span>
                  )}
                </span>
                <span className="amount">
                  {formatYen(b.spent)} / {formatYen(b.budget)}
                </span>
                <span className="budget-sub amount">
                  {b.remaining >= 0
                    ? `残り ${formatYen(b.remaining)}`
                    : `${formatYen(-b.remaining)} 超過`}
                  ・{b.percent}%
                </span>
                <span className="bar-track" aria-hidden="true">
                  <span
                    className="bar-fill"
                    style={{ width: `${Math.min(b.percent, 100)}%`, display: 'block' }}
                  />
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card" aria-labelledby="cards-heading">
        <h2 id="cards-heading">カード別の利用額</h2>
        {summary.byCard.length === 0 ? (
          <p className="empty">この月のカード利用はありません</p>
        ) : (
          <ul className="list">
            {summary.byCard.map((c) => (
              <li key={c.accountId}>
                <span className="truncate">{c.name}</span>
                <span className="amount">{formatYen(c.amount)}</span>
              </li>
            ))}
            <li className="row-total">
              <span>合計</span>
              <span className="amount" data-testid="card-total">
                {formatYen(summary.cardTotal)}
              </span>
            </li>
          </ul>
        )}
      </section>

      {accounts.length > 0 && transactions.length === 0 && (
        <p className="notice">
          まずは<Link to="/settings">設定</Link>で口座と初期残高を登録し、
          <Link to="/new">入力</Link>から記録を始めましょう。
        </p>
      )}
    </>
  );
}
