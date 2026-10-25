import { within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addAccount, saveTransaction, setAccountHidden, setBudget } from '../db/repository';
import { ensureSeeded } from '../db/seed';
import type { TransactionDraft } from '../domain/validation';
import { makeTx } from '../test/factories';
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

describe('セクションの並び順', () => {
  it('予算超過のアラートの下に、収支・カテゴリ・カード・予算・残高の順で並ぶ', async () => {
    const { cardA, cat, save } = await setup();
    await save({ amount: '5000', categoryId: cat('食費') });
    await save({ amount: '3000', accountId: cardA, categoryId: cat('日用品') });
    await setBudget(cat('食費'), '2026-10', '1000');

    await renderHome();
    const alert = await screen.findByTestId('over-budget');
    const regions = screen.getAllByRole('region');
    expect(
      regions.map((r) => r.getAttribute('aria-label') ?? r.querySelector('h2')?.textContent),
    ).toEqual(['月の収支', 'カテゴリ別の出費', 'カード別の利用額', '予算', '残高']);
    expect(
      alert.compareDocumentPosition(regions[0]) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('PC 版の2列用に、1列目に収支とカテゴリ、2列目にカード・予算・残高を入れる', async () => {
    const { cardA, cat, save } = await setup();
    await save({ amount: '5000', categoryId: cat('食費') });
    await save({ amount: '3000', accountId: cardA, categoryId: cat('日用品') });
    await setBudget(cat('食費'), '2026-10', '1000');

    const { container } = await renderHome();
    const alert = await screen.findByTestId('over-budget');
    const columns = container.querySelectorAll('.home-columns > .home-col');
    const labels = (col: Element) =>
      within(col as HTMLElement)
        .getAllByRole('region')
        .map((r) => r.getAttribute('aria-label') ?? r.querySelector('h2')?.textContent);
    expect(columns).toHaveLength(2);
    expect(labels(columns[0])).toEqual(['月の収支', 'カテゴリ別の出費']);
    expect(labels(columns[1])).toEqual(['カード別の利用額', '予算', '残高']);
    // アラートは2列の外（上）に置く
    expect(alert.closest('.home-columns')).toBeNull();
  });
});

describe('口座別残高', () => {
  it('現金・銀行・電子マネーの残高と合計を表示し、カードは出さない', async () => {
    const { cardA, cat, save } = await setup();
    await save({ amount: '5000', accountId: cardA, categoryId: cat('食費') });

    await renderHome();
    const section = await screen.findByRole('region', { name: '残高' });
    await waitFor(() => expect(screen.getByTestId('balance-total')).toHaveTextContent('¥102,000'));
    const rows = within(section)
      .getAllByRole('listitem')
      .map((li) => li.textContent);
    // 合計は一覧の末尾ではなく見出しの行に出す
    expect(rows).toEqual(['財布¥0', 'A銀行¥100,000', 'Suica¥2,000']);
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
    const section = await screen.findByRole('region', { name: '残高' });
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
    const section = await screen.findByRole('region', { name: '残高' });
    await waitFor(() => expect(within(section).getAllByRole('listitem')).toHaveLength(2));
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

  it('カテゴリの行を押すと、同じ月のそのカテゴリの出費だけの取引一覧が開く', async () => {
    const { cat, save } = await setup();
    await save({ amount: '30000', categoryId: cat('食費') });
    await save({ amount: '800', categoryId: cat('食費'), date: '2026-10-03' });
    await save({ amount: '10000', categoryId: cat('日用品') });
    await save({ amount: '5000', categoryId: cat('食費'), date: '2026-09-30' });

    const { user } = await renderHome();
    const section = await screen.findByRole('region', { name: 'カテゴリ別の出費' });
    await user.click(await within(section).findByRole('link', { name: /食費/ }));

    await screen.findByRole('heading', { level: 1, name: '取引一覧' });
    const categorySelect = await screen.findByRole('combobox', { name: 'カテゴリ' });
    await waitFor(() =>
      expect((categorySelect as HTMLSelectElement).selectedOptions[0]?.textContent).toBe('食費'),
    );
    expect(screen.getByRole('heading', { level: 2, name: /2026年10月/ })).toBeInTheDocument();
    const list = screen.getByRole('region', { name: '取引' });
    await waitFor(() => expect(within(list).getAllByRole('listitem')).toHaveLength(2));
    expect(within(list).queryByText(/10,000/)).not.toBeInTheDocument();
  });

  it('未分類の行からはカテゴリのない出費だけの取引一覧が開く', async () => {
    const { wallet, cat, save } = await setup();
    await save({ amount: '30000', categoryId: cat('食費') });
    // 入力画面からはカテゴリなしで保存できないので、古いデータを想定して直接入れる
    await db.transactions.add(makeTx({ type: 'expense', amount: 700, accountId: wallet }));

    const { user } = await renderHome();
    const section = await screen.findByRole('region', { name: 'カテゴリ別の出費' });
    await user.click(await within(section).findByRole('link', { name: /未分類/ }));

    const categorySelect = await screen.findByRole('combobox', { name: 'カテゴリ' });
    await waitFor(() =>
      expect((categorySelect as HTMLSelectElement).selectedOptions[0]?.textContent).toBe('未分類'),
    );
    const list = screen.getByRole('region', { name: '取引' });
    await waitFor(() => expect(within(list).getAllByRole('listitem')).toHaveLength(1));
    expect(within(list).getByRole('listitem')).toHaveTextContent('¥700');
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
    expect(rows).toEqual(['Aカード¥12,000', 'Bカード¥3,000']);
  });
});
