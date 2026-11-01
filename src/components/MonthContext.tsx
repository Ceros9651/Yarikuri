import { createContext, useContext, useState, type ReactNode } from 'react';
import { periodOf, periodRange, type PeriodRange } from '../domain/date';
import { useMonthStartDay } from '../hooks/useData';

interface MonthState {
  /** 表示中の月 'YYYY-MM'。範囲の開始日のある月の名前 */
  month: string;
  /** month の範囲（月の開始日から翌月の開始日の前日まで） */
  range: PeriodRange;
  startDay: number;
  setMonth: (month: string) => void;
}

const MonthContext = createContext<MonthState | null>(null);

/**
 * ホームと取引一覧で、表示中の月を共有する。月を選んでいないあいだは、起動した日が属する月を
 * 今月として表示し、月の開始日が変わったら今月を求め直す。選んだ月は開始日が変わっても名前を保つ。
 * 間違った範囲で読み込まないよう、開始日を読み終えるまで子を描画しない
 */
export function MonthProvider({ children }: { children: ReactNode }) {
  const startDay = useMonthStartDay();
  const [today] = useState(() => new Date());
  const [selected, setMonth] = useState<string | null>(null);
  if (startDay === undefined) return null;
  const month = selected ?? periodOf(today, startDay);
  const range = periodRange(month, startDay);
  return (
    <MonthContext.Provider value={{ month, range, startDay, setMonth }}>
      {children}
    </MonthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useMonth(): MonthState {
  const state = useContext(MonthContext);
  if (!state) throw new Error('MonthProvider がありません');
  return state;
}
