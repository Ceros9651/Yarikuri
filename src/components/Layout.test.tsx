import { within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { renderApp, resetDb, screen } from '../test/render';
import { mockViewport } from '../test/viewport';

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

  it('メインメニューにアプリ名があり、リンクは4つのまま', async () => {
    await renderApp('/');
    const nav = screen.getByRole('navigation', { name: 'メインメニュー' });
    expect(within(nav).getByText('Yarikuri')).toBeInTheDocument();
    expect(
      within(nav)
        .getAllByRole('link')
        .map((a) => a.textContent),
    ).toEqual(['ホーム', '取引一覧', '入力', '設定']);
  });

  it('現在のタブが選択状態になる', async () => {
    await renderApp('/settings');
    expect(screen.getByRole('link', { name: /設定/ })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: /ホーム/ })).not.toHaveAttribute('aria-current');
  });
});

describe('スマホ版の下部タブバー', () => {
  beforeEach(() => mockViewport('mobile'));

  it('取引一覧のタブは「出費」という名前になる', async () => {
    await renderApp('/');
    const nav = screen.getByRole('navigation', { name: 'メインメニュー' });
    expect(
      within(nav)
        .getAllByRole('link')
        .map((a) => a.textContent),
    ).toEqual(['ホーム', '出費', '入力', '設定']);
  });

  it('出費タブで一覧を開いても、出費タブが選択中のまま', async () => {
    await renderApp('/transactions?view=list');
    expect(screen.getByRole('link', { name: '出費' })).toHaveAttribute('aria-current', 'page');
  });

  it('絞り込んだ一覧で出費タブを押すと、カテゴリ別の出費に戻る', async () => {
    const { user } = await renderApp('/transactions?category=none');
    await screen.findByRole('heading', { level: 1, name: '取引一覧' });
    await user.click(screen.getByRole('link', { name: '出費' }));
    expect(await screen.findByRole('heading', { name: 'カテゴリ別の出費' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: '出費' })).toBeInTheDocument();
  });

  it('画面幅を変えると、サイドバーでは「取引一覧」、タブバーでは「出費」になる', async () => {
    await renderApp('/');
    expect(screen.getByRole('link', { name: '出費' })).toBeInTheDocument();
    mockViewport('desktop');
    expect(screen.getByRole('link', { name: '取引一覧' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '出費' })).not.toBeInTheDocument();
    mockViewport('mobile');
    expect(screen.getByRole('link', { name: '出費' })).toBeInTheDocument();
  });
});
