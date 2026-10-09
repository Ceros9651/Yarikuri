import { useEffect } from 'react';
import { HashRouter, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { MonthProvider } from './components/MonthContext';
import { ensureSeeded } from './db/seed';
import { EditTransactionPage } from './pages/EditTransactionPage';
import { HomePage } from './pages/HomePage';
import { NewTransactionPage } from './pages/NewTransactionPage';
import { SettingsPage } from './pages/SettingsPage';
import { TransactionsPage } from './pages/TransactionsPage';

/** ルーター以外のアプリ本体。テストでは MemoryRouter で包んで使う */
export function AppRoutes() {
  useEffect(() => {
    ensureSeeded().catch((e) => console.error('初期データの投入に失敗しました', e));
  }, []);

  return (
    <MonthProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<HomePage />} />
          <Route path="transactions" element={<TransactionsPage />} />
          <Route path="transactions/:id" element={<EditTransactionPage />} />
          <Route path="new" element={<NewTransactionPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </MonthProvider>
  );
}

export default function App() {
  return (
    <HashRouter>
      <AppRoutes />
    </HashRouter>
  );
}
