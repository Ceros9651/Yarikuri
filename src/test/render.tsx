import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes } from '../App';
import { db } from '../db/db';
import { ensureSeeded } from '../db/seed';

/** アプリ全体を指定パスで描画する。初期データの投入を待ってから返す */
export async function renderApp(path = '/') {
  await ensureSeeded();
  const user = userEvent.setup();
  const result = render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  );
  return { user, ...result };
}

/** テスト間でデータベースを空にする */
export async function resetDb() {
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
  });
}

export { db, screen, waitFor };
