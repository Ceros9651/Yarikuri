function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** 端末ローカルの今日 'YYYY-MM-DD' */
export function todayString(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** 'YYYY-MM-DD' または Date から 'YYYY-MM' */
export function monthOf(date: string | Date): string {
  if (typeof date === 'string') return date.slice(0, 7);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

export function addMonths(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  return monthOf(new Date(y, m - 1 + delta, 1));
}

/** 月の末日 'YYYY-MM-DD' */
export function lastDayOfMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return `${month}-${pad(new Date(y, m, 0).getDate())}`;
}

export function formatMonthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return `${y}年${m}月`;
}

/** 月の範囲。start・end は 'YYYY-MM-DD' で、どちらもその日を含む */
export interface PeriodRange {
  start: string;
  end: string;
}

/** 月の開始日の既定。1 なら暦月 */
export const DEFAULT_MONTH_START_DAY = 1;
export const MAX_MONTH_START_DAY = 28;

/** 'YYYY-MM' の月の範囲。startDay 日から翌月の startDay の前日まで。startDay は 1〜28 */
export function periodRange(month: string, startDay: number): PeriodRange {
  const [y, m] = month.split('-').map(Number);
  const end = new Date(y, m, startDay - 1);
  return {
    start: `${month}-${pad(startDay)}`,
    end: `${monthOf(end)}-${pad(end.getDate())}`,
  };
}

/** 日付 'YYYY-MM-DD' または Date が属する月 'YYYY-MM'。日が startDay より前なら前の月 */
export function periodOf(date: string | Date, startDay: number): string {
  const day = typeof date === 'string' ? Number(date.slice(8, 10)) : date.getDate();
  const month = monthOf(date);
  return day < startDay ? addMonths(month, -1) : month;
}

export function isInPeriod(date: string, range: PeriodRange): boolean {
  return range.start <= date && date <= range.end;
}

/** 「10月6日〜11月5日」 */
export function formatPeriodLabel(range: PeriodRange): string {
  const label = (date: string) => `${Number(date.slice(5, 7))}月${Number(date.slice(8))}日`;
  return `${label(range.start)}〜${label(range.end)}`;
}
