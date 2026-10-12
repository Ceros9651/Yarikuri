import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useMonth } from '../components/MonthContext';
import { MonthSwitcher } from '../components/MonthSwitcher';
import { formatYen } from '../domain/format';
import { TRANSACTION_TYPE_LABELS, type Transaction } from '../domain/types';
import { useAllData } from '../hooks/useData';

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

/** カテゴリのない出費で絞り込むときの `category` の値 */
export const UNCATEGORIZED = 'none';

/** 出費をカテゴリで絞り込む。`category` が未指定なら絞り込まない */
function matchesCategory(tx: Transaction, category: string | null): boolean {
  if (category === null) return true;
  if (tx.type !== 'expense') return false;
  return category === UNCATEGORIZED ? !tx.categoryId : tx.categoryId === category;
}

export function TransactionsPage() {
  const { month } = useMonth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const category = searchParams.get('category');
  const data = useAllData();
  const accounts = data?.accounts ?? [];
  const categories = data?.categories ?? [];
  const transactions = data?.transactions;

  const accountName = (id?: string) => accounts.find((a) => a.id === id)?.name ?? '';
  const categoryName = (id?: string) => categories.find((c) => c.id === id)?.name ?? '未分類';

  const rows = (transactions ?? [])
    .filter((tx) => tx.date.startsWith(`${month}-`) && matchesCategory(tx, category))
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));

  return (
    <>
      <h1>取引一覧</h1>
      <MonthSwitcher />
      {/* カテゴリを読み込む前に「未分類」と出さないよう、読み込み後に表示する */}
      {category !== null && data && (
        <div className="filter-bar">
          <span className="truncate">
            {category === UNCATEGORIZED ? '未分類' : categoryName(category)}の出費
          </span>
          <button
            type="button"
            className="link"
            onClick={() => setSearchParams({}, { replace: true })}
          >
            絞り込みを解除
          </button>
        </div>
      )}
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
                  onClick={() =>
                    // 編集後に同じ絞り込みの一覧へ戻れるようにする
                    navigate(`/transactions/${tx.id}`, {
                      state: { returnTo: `/transactions${location.search}` },
                    })
                  }
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
