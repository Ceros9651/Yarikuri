import { Link } from 'react-router-dom';
import { formatYen } from '../domain/format';
import { UNCATEGORIZED, type CategoryBreakdown } from '../domain/summary';

interface Props {
  byCategory: readonly CategoryBreakdown[];
  /** 見出しの行の右に出す出費の合計。省略すると出さない */
  total?: number;
}

/** 月のカテゴリ別の出費。PC 版はホーム、スマホ版は「出費」タブに置く */
export function CategoryExpenses({ byCategory, total }: Props) {
  return (
    <section className="home-section" aria-labelledby="categories-heading">
      <div className="section-head">
        <h2 id="categories-heading">カテゴリ別の出費</h2>
        {total !== undefined && (
          <span className="amount" data-testid="category-total">
            {formatYen(total)}
          </span>
        )}
      </div>
      {byCategory.length === 0 ? (
        <p className="empty">この月の出費はありません</p>
      ) : (
        <ul className="list">
          {byCategory.map((c) => (
            <li key={c.categoryId} className="bar-link-row">
              {/* カテゴリの中身を確かめられるよう、そのカテゴリで絞り込んだ取引一覧へ移る */}
              <Link
                className="bar-link"
                to={`/transactions?category=${c.categoryId || UNCATEGORIZED}`}
              >
                <span className="truncate">{c.name}</span>
                <span className="amount">
                  {formatYen(c.amount)}（{c.percent}%）
                </span>
                <span className="bar-track" aria-hidden="true">
                  <span className="bar-fill" style={{ width: `${c.percent}%`, display: 'block' }} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
