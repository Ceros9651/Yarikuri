import { setMonthStartDay } from '../../db/repository';
import { formatPeriodLabel, MAX_MONTH_START_DAY, periodOf, periodRange } from '../../domain/date';
import { useMonth } from '../MonthContext';

const DAYS = Array.from({ length: MAX_MONTH_START_DAY }, (_, i) => i + 1);

/** 月の開始日。選んだらすぐ保存し、ホーム・取引一覧・予算の月の範囲を変える */
export function MonthStartSection() {
  const { startDay } = useMonth();
  const current = periodRange(periodOf(new Date(), startDay), startDay);

  return (
    <section className="card" aria-labelledby="month-start-heading">
      <h2 id="month-start-heading">月の開始日</h2>
      <p className="muted">
        カードの引き落とし日の翌日などを選ぶと、その日から翌月のその前日までを1か月として集計します。
      </p>
      <div className="inline-form">
        <select
          aria-label="月の開始日"
          value={startDay}
          onChange={(e) => void setMonthStartDay(Number(e.target.value))}
        >
          {DAYS.map((d) => (
            <option key={d} value={d}>
              {d}日
            </option>
          ))}
        </select>
      </div>
      <p data-testid="current-period">今月は {formatPeriodLabel(current)}</p>
    </section>
  );
}
