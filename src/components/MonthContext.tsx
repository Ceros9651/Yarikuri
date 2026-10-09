import { createContext, useContext, useState, type ReactNode } from 'react';
import { monthOf } from '../domain/date';

interface MonthState {
  month: string;
  setMonth: (month: string) => void;
}

const MonthContext = createContext<MonthState | null>(null);

/** ホームと取引一覧で、表示中の月を共有する */
export function MonthProvider({ children }: { children: ReactNode }) {
  const [month, setMonth] = useState(() => monthOf(new Date()));
  return <MonthContext.Provider value={{ month, setMonth }}>{children}</MonthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useMonth(): MonthState {
  const state = useContext(MonthContext);
  if (!state) throw new Error('MonthProvider がありません');
  return state;
}
