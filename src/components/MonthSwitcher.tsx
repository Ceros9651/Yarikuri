import { addMonths, formatMonthLabel } from '../domain/date';
import { useMonth } from './MonthContext';

export function MonthSwitcher() {
  const { month, setMonth } = useMonth();
  return (
    <div className="month-switcher">
      <button type="button" aria-label="前月" onClick={() => setMonth(addMonths(month, -1))}>
        ‹
      </button>
      <h2>{formatMonthLabel(month)}</h2>
      <button type="button" aria-label="次月" onClick={() => setMonth(addMonths(month, 1))}>
        ›
      </button>
    </div>
  );
}
