import { within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addAccount,
  saveTransaction,
  setAccountHidden,
  setBudget,
  setCategoryHidden,
} from '../db/repository';
import { ensureSeeded } from '../db/seed';
import type { TransactionDraft } from '../domain/validation';
import { db, renderApp, resetDb, screen, waitFor } from '../test/render';

async function setup() {
  await ensureSeeded();
  const wallet = (await db.accounts.toArray())[0].id;
  const bank = await addAccount({ name: 'A銀行', type: 'bank', initialBalance: 100_000 });
  const suica = await addAccount({ name: 'Suica', type: 'emoney', initialBalance: 2_000 });
  const cardA = await addAccount({ name: 'Aカード', type: 'credit' });
  const cardB = await addAccount({ name: 'Bカード', type: 'credit' });
  const categories = await db.categories.toArray();
  const cat = (name: string, kind = 'expense') =>
    categories.find((c) => c.name === name && c.kind === kind)!.id;
  const save = (d: Partial<TransactionDraft>) =>
    saveTransaction(
      {
        type: 'expense',
        date: '2026-10-10',
        amount: '0',
        accountId: wallet,
        toAccountId: '',
        categoryId: '',
        ...d,
      },
      '',
    );
  return { wallet, bank, suica, cardA, cardB, cat, save };
}

/** 今日を 2026-10-10 にしてホームを開く */
async function renderHome() {
  vi.useFakeTimers({ now: new Date(2026, 9, 10), toFake: ['Date'] });
  const result = await renderApp('/');
  vi.useRealTimers();
  return result;
}

beforeEach(resetDb);
afterEach(() => vi.useRealTimers());

describe('月の収入・出費・差額', () => {
  it('今月を表示し、振替と残高調整を除いて集計する', async () => {
    const { bank, wallet, cardA, cat, save } = await setup();
    await save({
      type: 'income',
      amount: '250000',
      accountId: bank,
      categoryId: cat('給与', 'income'),
    });
    await save({ amount: '60000', categoryId: cat('食費') });
    await save({ amount: '20000', accountId: cardA, categoryId: cat('日用品') });
    await save({ type: 'transfer', amount: '30000', accountId: bank, toAccountId: wallet });
    await save({ type: 'adjustment', amount: '-500', accountId: wallet });

    await renderHome();
    expect(screen.getByRole('heading', { level: 2, name: '2026年10月' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('income')).toHaveTextContent('¥250,000'));
    expect(screen.getByTestId('expense')).toHaveTextContent('¥80,000');
    expect(screen.getByTestId('net')).toHaveTextContent('¥170,000');
  });

  it('前月に切り替えると前月の取引で集計する', async () => {
    const { cat, save } = await setup();
    await save({ date: '2026-09-15', amount: '1234', categoryId: cat('食費') });
    await save({ date: '2026-10-01', amount: '999', categoryId: cat('食費') });

    const { user } = await renderHome();
    await waitFor(() => expect(screen.getByTestId('expense')).toHaveTextContent('¥999'));
    await user.click(screen.getByRole('button', { name: '前月' }));
    expect(screen.getByRole('heading', { level: 2, name: '2026年9月' })).toBeInTheDocument();
    expect(screen.getByTestId('expense')).toHaveTextContent('¥1,234');
  });
});

describe('口座別残高', () => {
  it('現金・銀行・電子マネーの残高と合計を表示し、カードは出さない', async () => {
    const { cardA, cat, save } = await setup();
    await save({ amount: '5000', accountId: cardA, categoryId: cat('食費') });

    await renderHome();
    const section = await screen.findByRole('region', { name: '残高（月末時点）' });
    await waitFor(() => expect(screen.getByTestId('balance-total')).toHaveTextContent('¥102,000'));
    const rows = within(section)
      .getAllByRole('listitem')
      .map((li) => li.textContent);
    expect(rows).toEqual(['財布¥0', 'A銀行¥100,000', 'Suica¥2,000', '合計¥102,000']);
    expect(section).not.toHaveTextContent('カード');
  });

  it('過去の月は月末時点の残高を表示する', async () => {
    const { wallet, cat, save } = await setup();
    await save({
      type: 'income',
      date: '2026-09-20',
      amount: '1000',
      accountId: wallet,
      categoryId: cat('給与', 'income'),
    });
    await save({
      type: 'income',
      date: '2026-10-05',
      amount: '5000',
      accountId: wallet,
      categoryId: cat('給与', 'income'),
    });

    const { user } = await renderHome();
    const section = await screen.findByRole('region', { name: '残高（月末時点）' });
    await waitFor(() =>
      expect(within(section).getAllByRole('listitem')[0]).toHaveTextContent('¥6,000'),
    );
    await user.click(screen.getByRole('button', { name: '前月' }));
    expect(within(section).getAllByRole('listitem')[0]).toHaveTextContent('財布¥1,000');
  });

  it('非表示の口座は残高一覧に出さない', async () => {
    const { suica } = await setup();
    await setAccountHidden(suica, true);
    await renderHome();
    const section = await screen.findByRole('region', { name: '残高（月末時点）' });
    await waitFor(() => expect(within(section).getAllByRole('listitem')).toHaveLength(3));
    expect(section).not.toHaveTextContent('Suica');
  });
});

describe('カテゴリ別内訳とカード別利用額', () => {
  it('カテゴリを金額の大きい順に金額と割合で表示する', async () => {
    const { cat, save } = await setup();
    await save({ amount: '10000', categoryId: cat('日用品') });
    await save({ amount: '30000', categoryId: cat('食費') });

    await renderHome();
    const section = await screen.findByRole('region', { name: 'カテゴリ別の出費' });
    await waitFor(() => expect(within(section).getAllByRole('listitem')).toHaveLength(2));
    const rows = within(section)
      .getAllByRole('listitem')
      .map((li) => li.textContent);
    expect(rows).toEqual(['食費¥30,000（75%）', '日用品¥10,000（25%）']);
  });

  it('カードごとの利用額と合計を表示し、非表示のカードも含める', async () => {
    const { cardA, cardB, cat, save } = await setup();
    await save({ amount: '12000', accountId: cardA, categoryId: cat('食費') });
    await save({ amount: '3000', accountId: cardB, categoryId: cat('Amazon') });
    await setAccountHidden(cardA, true);

    await renderHome();
    const section = await screen.findByRole('region', { name: 'カード別の利用額' });
    await waitFor(() => expect(screen.getByTestId('card-total')).toHaveTextContent('¥15,000'));
    const rows = within(section)
      .getAllByRole('listitem')
      .map((li) => li.textContent);
    expect(rows).toEqual(['Aカード¥12,000', 'Bカード¥3,000', '合計¥15,000']);
  });
});

describe('予算', () => {
  const budgetsSection = () => screen.getByRole('region', { name: '予算' });

  it('予算のあるカテゴリの消化状況を、出費 0 円でも表示する', async () => {
    const { cat, save } = await setup();
    await setBudget(cat('食費'), '2026-10', '40000');
    await setBudget(cat('外食'), '2026-10', '10000');
    await save({ amount: '30000', categoryId: cat('食費') });

    await renderHome();
    await waitFor(() => expect(screen.getByTestId('budget-食費')).toBeInTheDocument());
    expect(screen.getByTestId('budget-食費')).toHaveTextContent(
      '食費¥30,000 / ¥40,000残り ¥10,000・75%',
    );
    expect(screen.getByTestId('budget-外食')).toHaveTextContent('外食¥0 / ¥10,000残り ¥10,000・0%');
    expect(screen.getByTestId('budget-食費')).not.toHaveTextContent('注意');
  });

  it('注意と超過を文言付きで区別して表示する', async () => {
    const { cat, save } = await setup();
    await setBudget(cat('食費'), '2026-10', '40000');
    await setBudget(cat('外食'), '2026-10', '10000');
    await save({ amount: '32000', categoryId: cat('食費') });
    await save({ amount: '12500', categoryId: cat('外食') });

    await renderHome();
    const over = await screen.findByTestId('budget-外食');
    await waitFor(() => expect(over).toHaveTextContent('超過'));
    expect(over).toHaveClass('budget-over');
    expect(over).toHaveTextContent('¥12,500 / ¥10,000¥2,500 超過・125%');
    const warning = screen.getByTestId('budget-食費');
    expect(warning).toHaveClass('budget-warning');
    expect(warning).toHaveTextContent('注意');
  });

  it('予算がない月は設定画面へ案内する', async () => {
    await setup();
    await renderHome();
    await waitFor(() => expect(budgetsSection()).toHaveTextContent('この月の予算はありません'));
    expect(within(budgetsSection()).getByRole('link', { name: '設定' })).toHaveAttribute(
      'href',
      '/settings',
    );
  });

  it('超過カテゴリを上部にまとめて知らせ、なければ表示しない', async () => {
    const { cat, save } = await setup();
    await setBudget(cat('外食'), '2026-10', '10000');
    await setBudget(cat('趣味・娯楽'), '2026-10', '5000');
    await setBudget(cat('食費'), '2026-10', '40000');
    await save({ amount: '10001', categoryId: cat('外食') });
    await save({ amount: '8000', categoryId: cat('趣味・娯楽') });
    await save({ date: '2026-09-10', amount: '1', categoryId: cat('食費') });

    const { user } = await renderHome();
    expect(await screen.findByTestId('over-budget')).toHaveTextContent(
      '予算超過：外食、趣味・娯楽',
    );
    await user.click(screen.getByRole('button', { name: '前月' }));
    expect(screen.queryByTestId('over-budget')).not.toBeInTheDocument();
  });

  it('非表示のカテゴリは消化状況とまとめに出さない', async () => {
    const { cat, save } = await setup();
    await setBudget(cat('Amazon'), '2026-10', '5000');
    await setBudget(cat('食費'), '2026-10', '40000');
    await save({ amount: '9000', categoryId: cat('Amazon') });
    await setCategoryHidden(cat('Amazon'), true);

    await renderHome();
    await waitFor(() => expect(screen.getByTestId('budget-食費')).toBeInTheDocument());
    expect(screen.queryByTestId('budget-Amazon')).not.toBeInTheDocument();
    expect(screen.queryByTestId('over-budget')).not.toBeInTheDocument();
  });
});
