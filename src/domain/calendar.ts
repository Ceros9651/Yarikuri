import { monthOf, todayString, type PeriodRange } from './date';
import type { Transaction } from './types';

export interface DailyTotal {
  expense: number;
  income: number;
}

/** 渡された取引を日付 'YYYY-MM-DD' ごとに足す。振替と残高調整は含めない */
export function dailyTotals(transactions: readonly Transaction[]): Map<string, DailyTotal> {
  const totals = new Map<string, DailyTotal>();
  for (const tx of transactions) {
    if (tx.type !== 'expense' && tx.type !== 'income') continue;
    const total = totals.get(tx.date) ?? { expense: 0, income: 0 };
    total[tx.type] += tx.amount;
    totals.set(tx.date, total);
  }
  return totals;
}

/** 月の範囲の日を日曜始まりの週の行に並べる。範囲の外の枠は null */
export function calendarWeeks(range: PeriodRange): (string | null)[][] {
  const [y, m, d] = range.start.split('-').map(Number);
  const cells: (string | null)[] = Array<null>(new Date(y, m - 1, d).getDay()).fill(null);
  for (
    let day = new Date(y, m - 1, d);
    todayString(day) <= range.end;
    day.setDate(day.getDate() + 1)
  ) {
    cells.push(todayString(day));
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/**
 * カレンダーの日の枠に出す日付。範囲が 2 つの暦月にまたがるときは、範囲の最初の日と
 * 後の月の 1日だけ「10/6」「11/1」のように月も添え、それ以外は日だけにする
 */
export function calendarDayLabel(date: string, range: PeriodRange): string {
  const day = Number(date.slice(8));
  const crossesMonths = monthOf(range.start) !== monthOf(range.end);
  if (crossesMonths && (date === range.start || day === 1)) {
    return `${Number(date.slice(5, 7))}/${day}`;
  }
  return String(day);
}
