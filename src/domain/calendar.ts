import { lastDayOfMonth } from './date';
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

/** 'YYYY-MM' の月を日曜始まりの週の行に並べる。月の外の枠は null */
export function calendarWeeks(month: string): (string | null)[][] {
  const [y, m] = month.split('-').map(Number);
  const firstWeekday = new Date(y, m - 1, 1).getDay();
  const lastDay = Number(lastDayOfMonth(month).slice(8));
  const cells: (string | null)[] = Array<null>(firstWeekday).fill(null);
  for (let d = 1; d <= lastDay; d++) cells.push(`${month}-${String(d).padStart(2, '0')}`);
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}
