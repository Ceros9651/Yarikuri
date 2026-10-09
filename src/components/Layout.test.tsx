import { beforeEach, describe, expect, it } from 'vitest';
import { renderApp, resetDb, screen } from '../test/render';

beforeEach(resetDb);

describe('下部タブバー', () => {
  it('各タブで画面が切り替わる', async () => {
    const { user } = await renderApp('/');
    const nav = screen.getByRole('navigation', { name: 'メインメニュー' });
    expect(nav).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: /取引一覧/ }));
    expect(screen.getByRole('heading', { level: 1, name: '取引一覧' })).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: /入力/ }));
    expect(screen.getByRole('heading', { level: 1, name: '入力' })).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: /設定/ }));
    expect(screen.getByRole('heading', { level: 1, name: '設定' })).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: /ホーム/ }));
    expect(screen.getByRole('heading', { level: 1, name: 'ホーム' })).toBeInTheDocument();
  });

  it('現在のタブが選択状態になる', async () => {
    await renderApp('/settings');
    expect(screen.getByRole('link', { name: /設定/ })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: /ホーム/ })).not.toHaveAttribute('aria-current');
  });
});
