import { useNavigate } from 'react-router-dom';
import { useMonth } from '../components/MonthContext';
import { MonthSwitcher } from '../components/MonthSwitcher';
import { formatYen } from '../domain/format';
import { TRANSACTION_TYPE_LABELS, type Transaction } from '../domain/types';
import { useAccounts, useCategories, useTransactions } from '../hooks/useData';

function signedAmount(tx: Transaction): { text: string; className: string } {
  switch (tx.type) {
    case 'income':
      return { text: `+${formatYen(tx.amount)}`, className: 'income' };
    case 'expense':
      return { text: `-${formatYen(tx.amount)}`, className: 'expense' };
    case 'transfer':
      return { text: formatYen(tx.amount), className: '' };
    case 'adjustment':
      return { text: (tx.amount > 0 ? '+' : '') + formatYen(tx.amount), className: '' };
  }
}

export function TransactionsPage() {
  const { month } = useMonth();
  const navigate = useNavigate();
  const accounts = useAccounts();
  const categories = useCategories();
  const transactions = useTransactions();

  const accountName = (id?: string) => accounts.find((a) => a.id === id)?.name ?? '';
  const categoryName = (id?: string) => categories.find((c) => c.id === id)?.name ?? '未分類';

  const rows = (transactions ?? [])
    .filter((tx) => tx.date.startsWith(`${month}-`))
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));

  return (
    <>
      <h1>取引一覧</h1>
      <MonthSwitcher />
      <section className="card" aria-label="取引">
        {transactions && rows.length === 0 && <p className="empty">この月の取引はありません</p>}
        <ul className="list">
          {rows.map((tx) => {
            const amount = signedAmount(tx);
            const title =
              tx.type === 'transfer'
                ? `${accountName(tx.accountId)} → ${accountName(tx.toAccountId)}`
                : tx.type === 'adjustment'
                  ? TRANSACTION_TYPE_LABELS.adjustment
                  : categoryName(tx.categoryId);
            const sub = [
              TRANSACTION_TYPE_LABELS[tx.type],
              tx.type === 'transfer' ? '' : accountName(tx.accountId),
              tx.memo ?? '',
            ]
              .filter(Boolean)
              .join('・');
            return (
              <li key={tx.id}>
                <button
                  type="button"
                  className="tx-row"
                  onClick={() => navigate(`/transactions/${tx.id}`)}
                >
                  <span className="tx-date">{tx.date.slice(5).replace('-', '/')}</span>
                  <span className="truncate">{title}</span>
                  <span className={`amount ${amount.className}`}>{amount.text}</span>
                  <span className="tx-sub muted truncate">{sub}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}
