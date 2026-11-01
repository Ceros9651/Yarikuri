import { addMonths, formatMonthLabel, formatPeriodLabel } from '../domain/date';
import { useMonth } from './MonthContext';

export function MonthSwitcher() {
  const { month, range, startDay, setMonth } = useMonth();
  return (
    <div className="month-switcher">
      <button type="button" aria-label="前月" onClick={() => setMonth(addMonths(month, -1))}>
        ‹
      </button>
      {/* 開始日が 1日以外のときは、月名と一緒に読まれるよう同じ見出しの中に期間を添える */}
      <h2>
        {formatMonthLabel(month)}
        {startDay !== 1 && <span className="month-period"> {formatPeriodLabel(range)}</span>}
      </h2>
      <button type="button" aria-label="次月" onClick={() => setMonth(addMonths(month, 1))}>
        ›
      </button>
    </div>
  );
}
