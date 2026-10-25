import { render, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppRoutes } from '../App';
import { addAccount, saveTransaction } from '../db/repository';
import { ensureSeeded } from '../db/seed';
import { putTransactions } from '../test/db';
import { makeTx } from '../test/factories';
import { db, renderApp, resetDb, screen, waitFor } from '../test/render';
import { mockViewport } from '../test/viewport';

/** 2026年9月・10月に出費・収入・振替を入れる。10月の出費は 食費 1,200 / 日用品 700 / 未分類 111 */
async function setup() {
  await ensureSeeded();
  const wallet = (await db.accounts.toArray())[0].id;
  const bank = await addAccount({ name: 'A銀行', type: 'bank', initialBalance: 50_000 });
  const card = await addAccount({ name: 'Aカード', type: 'credit' });
  const categories = await db.categories.toArray();
  const cat = (name: string, kind = 'expense') =>
    categories.find((c) => c.name === name && c.kind === kind)!.id;
  const save = (
    type: 'expense' | 'income' | 'transfer',
    date: string,
    amount: string,
    categoryId: string,
    accountId = wallet,
    toAccountId = '',
  ) => saveTransaction({ type, date, amount, accountId, toAccountId, categoryId }, '');
  await save('expense', '2026-09-20', '900', cat('食費'));
  await save('expense', '2026-10-03', '300', cat('食費'));
  await save('expense', '2026-10-08', '500', cat('食費'));
  await save('expense', '2026-10-04', '400', cat('食費'), card);
  await save('expense', '2026-10-05', '700', cat('日用品'));
  await putTransactions([
    makeTx({ type: 'expense', date: '2026-10-06', amount: 111, accountId: wallet }),
  ]);
  await save('income', '2026-10-25', '250000', cat('給与', 'income'), bank);
  await save('transfer', '2026-10-07', '20000', '', bank, wallet);
  return { wallet, cat };
}

/** 今日を 2026-10-10 にして開く */
async function renderAt(path: string) {
  vi.useFakeTimers({ now: new Date(2026, 9, 10), toFake: ['Date'] });
  const result = await renderApp(path);
  vi.useRealTimers();
  return result;
}

const categoryNames = () =>
  within(screen.getByRole('region', { name: 'カテゴリ別の出費' }))
    .queryAllByRole('link')
    .map((a) => a.querySelector('.truncate')?.textContent);

const rowTexts = () =>
  within(screen.getByRole('region', { name: '取引' }))
    .queryAllByRole('listitem')
    .map((li) => li.textContent ?? '');

const selectedName = (name: string) =>
  (screen.getByRole('combobox', { name }) as HTMLSelectElement).selectedOptions[0]?.textContent;

beforeEach(resetDb);
afterEach(() => vi.useRealTimers());

describe('スマホ版の出費タブ', () => {
  beforeEach(() => mockViewport('mobile'));

  it('絞り込みなしで開くと、カテゴリ別の出費と月の出費の合計を出し、一覧と絞り込みは出さない', async () => {
    await setup();
    await renderAt('/transactions');
    await waitFor(() => expect(categoryNames()).toEqual(['食費', '日用品', '未分類']));
    expect(screen.getByRole('heading', { level: 1, name: '出費' })).toBeInTheDocument();
    expect(screen.getByTestId('category-total')).toHaveTextContent('¥2,011');
    expect(screen.getByText('2026年10月')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: '取引' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'カテゴリ' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'すべての取引' })).toBeInTheDocument();
  });

  it('出費のない月は、その旨と ¥0 を出し、すべての取引への入口は残す', async () => {
    await setup();
    const { user } = await renderAt('/transactions');
    await waitFor(() => expect(categoryNames()).toHaveLength(3));
    await user.click(screen.getByRole('button', { name: '次月' }));
    expect(await screen.findByText('この月の出費はありません')).toBeInTheDocument();
    expect(screen.getByTestId('category-total')).toHaveTextContent('¥0');
    expect(screen.getByRole('link', { name: 'すべての取引' })).toBeInTheDocument();
  });

  it('月を切り替えると、その月のカテゴリ別の出費と合計になる', async () => {
    await setup();
    const { user } = await renderAt('/transactions');
    await waitFor(() => expect(categoryNames()).toHaveLength(3));
    await user.click(screen.getByRole('button', { name: '前月' }));
    await waitFor(() => expect(categoryNames()).toEqual(['食費']));
    expect(screen.getByTestId('category-total')).toHaveTextContent('¥900');
  });

  it('カテゴリの行を押すと、そのカテゴリの出費だけの一覧が開く', async () => {
    await setup();
    const { user } = await renderAt('/transactions');
    await user.click(await screen.findByRole('link', { name: /食費/ }));
    await screen.findByRole('heading', { level: 1, name: '取引一覧' });
    await waitFor(() => expect(rowTexts()).toHaveLength(3));
    expect(selectedName('カテゴリ')).toBe('食費');
  });

  it('すべての取引を押すと、収入・振替を含む月の全取引の一覧が開く', async () => {
    await setup();
    const { user } = await renderAt('/transactions');
    await user.click(await screen.findByRole('link', { name: 'すべての取引' }));
    await waitFor(() => expect(rowTexts()).toHaveLength(7));
    expect(selectedName('カテゴリ')).toBe('すべて');
    expect(selectedName('支払元')).toBe('すべて');
  });

  it('カテゴリの行から開いた一覧で「すべて」に戻しても、一覧のまま全取引を出す', async () => {
    const { cat } = await setup();
    const { user } = await renderAt(`/transactions?category=${cat('食費')}`);
    await waitFor(() => expect(rowTexts()).toHaveLength(3));
    await user.selectOptions(screen.getByRole('combobox', { name: 'カテゴリ' }), 'すべて');
    await waitFor(() => expect(rowTexts()).toHaveLength(7));
    expect(screen.queryByRole('region', { name: 'カテゴリ別の出費' })).not.toBeInTheDocument();
  });

  it('全取引の一覧から編集して保存すると、全取引の一覧に戻る', async () => {
    await setup();
    const { user } = await renderAt('/transactions?view=list');
    await waitFor(() => expect(rowTexts()).toHaveLength(7));
    await user.click(screen.getByRole('button', { name: /10\/08/ }));
    const amount = await screen.findByLabelText('金額');
    await user.clear(amount);
    await user.type(amount, '650');
    await user.click(screen.getByRole('button', { name: '保存' }));

    await screen.findByRole('heading', { level: 1, name: '取引一覧' });
    await waitFor(() => expect(rowTexts()).toHaveLength(7));
    expect(rowTexts().find((t) => t.startsWith('10/08'))).toContain('650');
  });

  it('画面幅を PC 版に広げると、カレンダーと一覧に切り替わり、月はそのまま残る', async () => {
    await setup();
    const { user } = await renderAt('/transactions');
    await waitFor(() => expect(categoryNames()).toHaveLength(3));
    await user.click(screen.getByRole('button', { name: '前月' }));
    mockViewport('desktop');
    await waitFor(() => expect(rowTexts()).toHaveLength(1));
    expect(screen.getByText('2026年9月')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'カレンダー' })).toBeInTheDocument();
  });
});

describe('PC 版の取引一覧', () => {
  it('絞り込みなしで開くと従来どおりカレンダーと一覧を出し、カテゴリ別の出費は出さない', async () => {
    await setup();
    await renderAt('/transactions');
    await waitFor(() => expect(rowTexts()).toHaveLength(7));
    expect(screen.getByRole('region', { name: 'カレンダー' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'カテゴリ別の出費' })).not.toBeInTheDocument();
  });

  it('絞り込みを変えても URL に view を付けない', async () => {
    await setup();
    const user = userEvent.setup();
    let search = '';
    function LocationProbe() {
      search = useLocation().search;
      return null;
    }
    vi.useFakeTimers({ now: new Date(2026, 9, 10), toFake: ['Date'] });
    render(
      <MemoryRouter initialEntries={['/transactions']}>
        <AppRoutes />
        <LocationProbe />
      </MemoryRouter>,
    );
    vi.useRealTimers();
    await waitFor(() => expect(rowTexts()).toHaveLength(7));
    await user.selectOptions(screen.getByRole('combobox', { name: 'カテゴリ' }), '食費');
    await waitFor(() => expect(rowTexts()).toHaveLength(3));
    await user.selectOptions(screen.getByRole('combobox', { name: 'カテゴリ' }), 'すべて');
    await waitFor(() => expect(rowTexts()).toHaveLength(7));
    expect(search).toBe('');
  });
});
