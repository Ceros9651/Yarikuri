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

/** 出費を支払元の口座で絞り込む。`account` が未指定なら絞り込まない */
function matchesAccount(tx: Transaction, account: string | null): boolean {
  if (account === null) return true;
  return tx.type === 'expense' && tx.accountId === account;
}

interface FilterChipsProps {
  label: string;
  options: { id: string; name: string }[];
  selected: string | null;
  onSelect: (id: string | null) => void;
}

/** 先頭に「すべて」を置いた絞り込みの選択肢 */
function FilterChips({ label, options, selected, onSelect }: FilterChipsProps) {
  return (
    <div className="field">
      <span>{label}</span>
      <div className="chips" role="group" aria-label={label}>
        <button type="button" aria-pressed={selected === null} onClick={() => onSelect(null)}>
          すべて
        </button>
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            aria-pressed={selected === o.id}
            onClick={() => onSelect(o.id)}
          >
            {o.name}
          </button>
        ))}
      </div>
    </div>
  );
}

export function TransactionsPage() {
  const { month } = useMonth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const category = searchParams.get('category');
  const account = searchParams.get('account');
  const filtered = category !== null || account !== null;
  const data = useAllData();
  const accounts = data?.accounts ?? [];
  const categories = data?.categories ?? [];
  const transactions = data?.transactions;

  const accountName = (id?: string) => accounts.find((a) => a.id === id)?.name ?? '';
  const categoryName = (id?: string) => categories.find((c) => c.id === id)?.name ?? '未分類';

  const monthTransactions = (transactions ?? []).filter((tx) => tx.date.startsWith(`${month}-`));
  const rows = monthTransactions
    .filter((tx) => matchesCategory(tx, category) && matchesAccount(tx, account))
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));

  // 非表示のカテゴリ・口座も、それで絞り込んでいるあいだは選択肢に残す
  const categoryOptions = categories.filter(
    (c) => c.kind === 'expense' && (!c.hidden || c.id === category),
  );
  const hasUncategorized = monthTransactions.some((tx) => tx.type === 'expense' && !tx.categoryId);
  const categoryChips = [
    ...categoryOptions,
    ...(hasUncategorized || category === UNCATEGORIZED
      ? [{ id: UNCATEGORIZED, name: '未分類' }]
      : []),
  ];
  const accountChips = accounts.filter((a) => !a.hidden || a.id === account);

  /** もう一方の条件は残したまま、押した条件だけを変える */
  const setFilter = (key: 'category' | 'account', value: string | null) =>
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value === null) next.delete(key);
        else next.set(key, value);
        return next;
      },
      // チップを押すたびに履歴を増やさず、戻る操作で前の画面へ戻れるようにする
      { replace: true },
    );

  return (
    <>
      <h1>取引一覧</h1>
      <MonthSwitcher />
      {data && (
        <div className="tx-filters">
          <FilterChips
            label="カテゴリ"
            options={categoryChips}
            selected={category}
            onSelect={(id) => setFilter('category', id)}
          />
          <FilterChips
            label="支払元"
            options={accountChips}
            selected={account}
            onSelect={(id) => setFilter('account', id)}
          />
        </div>
      )}
      <section className="card" aria-label="取引">
        {transactions && rows.length === 0 && (
          <p className="empty">
            {filtered ? '条件に合う出費はありません' : 'この月の取引はありません'}
          </p>
        )}
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
