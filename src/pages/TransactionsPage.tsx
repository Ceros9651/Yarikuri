import { useEffect } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useMonth } from '../components/MonthContext';
import { MonthSwitcher } from '../components/MonthSwitcher';
import { calendarWeeks, dailyTotals } from '../domain/calendar';
import { todayString } from '../domain/date';
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

/** '2026-10-05' → '10月5日' */
function formatDayLabel(date: string): string {
  const [, m, d] = date.split('-').map(Number);
  return `${m}月${d}日`;
}

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

interface CalendarProps {
  month: string;
  transactions: readonly Transaction[];
  selected: string | null;
  onSelect: (date: string) => void;
}

/** 月のカレンダー。各日の枠に出費・収入の合計を出し、押すとその日で絞り込む。スマホ版では CSS で隠す */
function TransactionCalendar({ month, transactions, selected, onSelect }: CalendarProps) {
  const totals = dailyTotals(transactions);
  const today = todayString();
  return (
    <section className="tx-calendar" aria-label="カレンダー">
      <div className="tx-calendar-grid">
        {WEEKDAYS.map((w) => (
          <span key={w} className="tx-calendar-weekday" aria-hidden="true">
            {w}
          </span>
        ))}
        {calendarWeeks(month)
          .flat()
          .map((date, i) => {
            if (date === null) return <div key={`blank-${i}`} className="tx-calendar-blank" />;
            const { expense = 0, income = 0 } = totals.get(date) ?? {};
            const label = [
              formatDayLabel(date),
              expense > 0 ? `出費 ${formatYen(expense)}` : '',
              income > 0 ? `収入 ${formatYen(income)}` : '',
            ]
              .filter(Boolean)
              .join(' ');
            return (
              <button
                key={date}
                type="button"
                className="tx-calendar-day"
                aria-label={label}
                aria-pressed={selected === date}
                aria-current={date === today ? 'date' : undefined}
                onClick={() => onSelect(date)}
              >
                <span className="tx-calendar-date">{Number(date.slice(8))}</span>
                {expense > 0 && <span className="amount expense">-{formatYen(expense)}</span>}
                {income > 0 && <span className="amount income">+{formatYen(income)}</span>}
              </button>
            );
          })}
      </div>
    </section>
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
  // 選択中の月に含まれない日付（月を切り替えた直後など）では絞り込まない
  const dateParam = searchParams.get('date');
  const day = dateParam?.startsWith(`${month}-`) ? dateParam : null;
  const data = useAllData();
  const accounts = data?.accounts ?? [];
  const categories = data?.categories ?? [];
  const transactions = data?.transactions;

  const accountName = (id?: string) => accounts.find((a) => a.id === id)?.name ?? '';
  const categoryName = (id?: string) => categories.find((c) => c.id === id)?.name ?? '未分類';

  const monthTransactions = (transactions ?? []).filter((tx) => tx.date.startsWith(`${month}-`));
  // カレンダーの金額はカテゴリ・支払元の絞り込みに連動させ、日付では絞らない
  const matched = monthTransactions.filter(
    (tx) => matchesCategory(tx, category) && matchesAccount(tx, account),
  );
  const rows = matched
    .filter((tx) => day === null || tx.date === day)
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
  const setFilter = (key: 'category' | 'account' | 'date', value: string | null) =>
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

  // 月を切り替えたら、前の月の日付の絞り込みを URL からも消す
  useEffect(() => {
    if (dateParam !== null && !dateParam.startsWith(`${month}-`)) setFilter('date', null);
    // setFilter は描画のたびに作り直されるので依存に含めない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateParam, month]);

  const emptyMessage = filtered
    ? '条件に合う出費はありません'
    : day !== null
      ? 'この日の取引はありません'
      : 'この月の取引はありません';

  return (
    <>
      <h1>取引一覧</h1>
      <div className="tx-columns">
        <div className="tx-col">
          <MonthSwitcher />
          {data && (
            <TransactionCalendar
              month={month}
              transactions={matched}
              selected={day}
              onSelect={(date) => setFilter('date', date === day ? null : date)}
            />
          )}
        </div>
        <div className="tx-col">
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
          {day !== null && (
            <div className="tx-day-filter">
              <span>{formatDayLabel(day)}の取引</span>
              <button
                type="button"
                className="link"
                aria-label="日付の絞り込みを解除"
                onClick={() => setFilter('date', null)}
              >
                解除
              </button>
            </div>
          )}
          <section className="card" aria-label="取引">
            {transactions && rows.length === 0 && <p className="empty">{emptyMessage}</p>}
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
        </div>
      </div>
    </>
  );
}
