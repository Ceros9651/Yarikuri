import { within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addAccount, saveTransaction, setAccountHidden, setCategoryHidden } from '../db/repository';
import { computeBalance } from '../domain/balance';
import { todayString } from '../domain/date';
import { db, renderApp, resetDb, screen, waitFor } from '../test/render';
import { ensureSeeded } from '../db/seed';

async function setup() {
  await ensureSeeded();
  const wallet = (await db.accounts.toArray())[0];
  await db.accounts.update(wallet.id, { initialBalance: 5_300 });
  const bank = await addAccount({ name: 'A銀行', type: 'bank', initialBalance: 50_000 });
  const suica = await addAccount({ name: 'Suica', type: 'emoney' });
  const card = await addAccount({ name: 'Aカード', type: 'credit' });
  const categories = await db.categories.toArray();
  const cat = (name: string, kind = 'expense') =>
    categories.find((c) => c.name === name && c.kind === kind)!.id;
  return { wallet: wallet.id, bank, suica, card, cat };
}

async function balanceOf(id: string) {
  const account = (await db.accounts.get(id))!;
  return computeBalance(account, await db.transactions.toArray());
}

const optionNames = (select: HTMLElement) =>
  within(select)
    .getAllByRole('option')
    .map((o) => o.textContent);

beforeEach(resetDb);
afterEach(() => vi.restoreAllMocks());

describe('入力画面', () => {
  it('日付の初期値は今日', async () => {
    await renderApp('/new');
    expect(screen.getByLabelText('日付')).toHaveValue(todayString());
  });

  it('金額欄は数字キーボードになる', async () => {
    await renderApp('/new');
    expect(screen.getByLabelText('金額')).toHaveAttribute('inputmode', 'numeric');
  });

  it('財布から支払う出費を保存すると残高が減りホームに戻る', async () => {
    const { wallet } = await setup();
    const { user } = await renderApp('/new');
    await user.type(screen.getByLabelText('金額'), '800');
    await user.selectOptions(await screen.findByLabelText('カテゴリ'), '食費');
    await user.selectOptions(screen.getByLabelText('支払元'), '財布');
    await user.type(screen.getByLabelText('メモ'), 'コンビニ');
    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'ホーム' })).toBeInTheDocument();
    const [tx] = await db.transactions.toArray();
    expect(tx).toMatchObject({ type: 'expense', amount: 800, accountId: wallet, memo: 'コンビニ' });
    expect(await balanceOf(wallet)).toBe(4_500);
  });

  it('給与を銀行口座に記録する', async () => {
    const { bank, cat } = await setup();
    const { user } = await renderApp('/new');
    await user.click(screen.getByRole('button', { name: '収入' }));
    await user.type(screen.getByLabelText('金額'), '250000');
    await user.selectOptions(await screen.findByLabelText('カテゴリ'), '給与');
    await user.selectOptions(screen.getByLabelText('入金先'), 'A銀行');
    await user.click(screen.getByRole('button', { name: '保存' }));

    await screen.findByRole('heading', { level: 1, name: 'ホーム' });
    const [tx] = await db.transactions.toArray();
    expect(tx).toMatchObject({
      type: 'income',
      amount: 250_000,
      categoryId: cat('給与', 'income'),
    });
    expect(await balanceOf(bank)).toBe(300_000);
  });

  it('クレジットカードで支払っても口座残高は変わらない', async () => {
    const { wallet, bank, card } = await setup();
    const { user } = await renderApp('/new');
    await user.type(screen.getByLabelText('金額'), '3000');
    await user.selectOptions(await screen.findByLabelText('支払元'), 'Aカード');
    await user.click(screen.getByRole('button', { name: '保存' }));

    await screen.findByRole('heading', { level: 1, name: 'ホーム' });
    const [tx] = await db.transactions.toArray();
    expect(tx).toMatchObject({ type: 'expense', amount: 3_000, accountId: card });
    expect(await balanceOf(wallet)).toBe(5_300);
    expect(await balanceOf(bank)).toBe(50_000);
  });

  it('ATM で引き出す振替を記録する', async () => {
    const { wallet, bank } = await setup();
    const { user } = await renderApp('/new');
    await user.click(screen.getByRole('button', { name: '振替' }));
    await user.type(screen.getByLabelText('金額'), '20000');
    await user.selectOptions(await screen.findByLabelText('振替元'), 'A銀行');
    await user.selectOptions(screen.getByLabelText('振替先'), '財布');
    await user.click(screen.getByRole('button', { name: '保存' }));

    await screen.findByRole('heading', { level: 1, name: 'ホーム' });
    expect(await balanceOf(bank)).toBe(30_000);
    expect(await balanceOf(wallet)).toBe(25_300);
  });

  it('財布の残高を実際に合わせる', async () => {
    const { wallet } = await setup();
    const { user } = await renderApp('/new');
    await user.click(screen.getByRole('button', { name: '残高調整' }));
    await user.selectOptions(await screen.findByLabelText('口座'), '財布');
    expect(await screen.findByText('アプリ上の残高: ¥5,300')).toBeInTheDocument();
    await user.type(screen.getByLabelText('実際の残高'), '5000');
    await user.click(screen.getByRole('button', { name: '保存' }));

    await screen.findByRole('heading', { level: 1, name: 'ホーム' });
    const [tx] = await db.transactions.toArray();
    expect(tx).toMatchObject({ type: 'adjustment', amount: -300 });
    expect(await balanceOf(wallet)).toBe(5_000);
  });
});

describe('選択肢の絞り込み', () => {
  it('クレジットカードは出費の支払元にだけ表示される', async () => {
    await setup();
    const { user } = await renderApp('/new');
    await waitFor(() =>
      expect(optionNames(screen.getByLabelText('支払元'))).toEqual([
        '財布',
        'A銀行',
        'Suica',
        'Aカード',
      ]),
    );

    await user.click(screen.getByRole('button', { name: '収入' }));
    expect(optionNames(screen.getByLabelText('入金先'))).toEqual(['財布', 'A銀行', 'Suica']);

    await user.click(screen.getByRole('button', { name: '振替' }));
    expect(optionNames(screen.getByLabelText('振替元'))).toEqual(['財布', 'A銀行', 'Suica']);
    expect(optionNames(screen.getByLabelText('振替先'))).toEqual(['財布', 'A銀行', 'Suica']);

    await user.click(screen.getByRole('button', { name: '残高調整' }));
    expect(optionNames(screen.getByLabelText('口座'))).toEqual(['財布', 'A銀行', 'Suica']);
  });

  it('非表示の口座とカテゴリは選択肢に出ない', async () => {
    const { card, cat } = await setup();
    await setAccountHidden(card, true);
    await setCategoryHidden(cat('Amazon'), true);
    await renderApp('/new');
    await waitFor(() =>
      expect(optionNames(screen.getByLabelText('支払元'))).toEqual(['財布', 'A銀行', 'Suica']),
    );
    expect(optionNames(screen.getByLabelText('カテゴリ'))).not.toContain('Amazon');
  });

  it('カテゴリは種類ごとに出し分ける', async () => {
    await setup();
    const { user } = await renderApp('/new');
    await waitFor(() => expect(optionNames(screen.getByLabelText('カテゴリ'))).toContain('食費'));
    expect(optionNames(screen.getByLabelText('カテゴリ'))).toEqual([
      '食費',
      '日用品',
      '交通費',
      '飲み会',
      '外食',
      '趣味・娯楽',
      'Amazon',
      '衣服',
      'その他',
    ]);
    await user.click(screen.getByRole('button', { name: '収入' }));
    expect(optionNames(screen.getByLabelText('カテゴリ'))).toEqual([
      '給与',
      '賞与',
      '副業',
      '臨時収入',
      'その他',
    ]);
  });
});

describe('入力エラー', () => {
  it.each(['0', '-5', '1.5', ''])('金額「%s」は保存されない', async (input) => {
    await setup();
    const { user } = await renderApp('/new');
    await screen.findByLabelText('カテゴリ');
    if (input) await user.type(screen.getByLabelText('金額'), input);
    await user.click(screen.getByRole('button', { name: '保存' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('金額は1〜999,999,999円');
    expect(await db.transactions.count()).toBe(0);
  });

  it('同じ口座どうしの振替は保存されない', async () => {
    await setup();
    const { user } = await renderApp('/new');
    await user.click(screen.getByRole('button', { name: '振替' }));
    await user.type(screen.getByLabelText('金額'), '1000');
    await user.selectOptions(await screen.findByLabelText('振替元'), 'A銀行');
    await user.selectOptions(screen.getByLabelText('振替先'), 'A銀行');
    await user.click(screen.getByRole('button', { name: '保存' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '振替元と異なる口座を選んでください',
    );
    expect(await db.transactions.count()).toBe(0);
  });
});

describe('取引一覧', () => {
  it('選択中の月の取引だけを新しい日付順に表示する', async () => {
    const { wallet, bank, card, cat } = await setup();
    const expense = (date: string, amount: string, accountId: string, memo = '') =>
      saveTransaction(
        { type: 'expense', date, amount, accountId, toAccountId: '', categoryId: cat('食費') },
        memo,
      );
    await expense('2026-09-30', '100', wallet);
    await expense('2026-10-01', '200', wallet, 'ランチ');
    await expense('2026-10-31', '300', card);
    await expense('2026-11-01', '400', wallet);
    await saveTransaction(
      {
        type: 'transfer',
        date: '2026-10-15',
        amount: '5000',
        accountId: bank,
        toAccountId: wallet,
        categoryId: '',
      },
      '',
    );
    await setAccountHidden(card, true);

    vi.useFakeTimers({ now: new Date(2026, 9, 10), toFake: ['Date'] });
    const { user } = await renderApp('/transactions');
    vi.useRealTimers();

    const list = await screen.findByRole('region', { name: '取引' });
    await waitFor(() => expect(within(list).getAllByRole('listitem')).toHaveLength(3));
    const items = within(list)
      .getAllByRole('listitem')
      .map((li) => li.textContent);
    expect(items[0]).toContain('10/31');
    expect(items[0]).toContain('Aカード'); // 非表示の口座も名前で表示
    expect(items[1]).toContain('A銀行 → 財布');
    expect(items[2]).toContain('10/01');
    expect(items[2]).toContain('ランチ');

    await user.click(screen.getByRole('button', { name: '前月' }));
    await waitFor(() => expect(within(list).getAllByRole('listitem')).toHaveLength(1));
    expect(within(list).getByRole('listitem')).toHaveTextContent('09/30');
  });
});

describe('取引の編集と削除', () => {
  async function setupExpense() {
    const ids = await setup();
    const id = await saveTransaction(
      {
        type: 'expense',
        date: todayString(),
        amount: '800',
        accountId: ids.wallet,
        toAccountId: '',
        categoryId: ids.cat('食費'),
      },
      '',
    );
    return { ...ids, id };
  }

  it('金額を修正すると残高に反映される', async () => {
    const { wallet, id } = await setupExpense();
    expect(await balanceOf(wallet)).toBe(4_500);
    const { user } = await renderApp(`/transactions/${id}`);
    const amount = await screen.findByLabelText('金額');
    expect(amount).toHaveValue('800');
    expect(screen.getByRole('button', { name: '収入' })).toBeDisabled();
    await user.clear(amount);
    await user.type(amount, '1000');
    await user.click(screen.getByRole('button', { name: '保存' }));

    await screen.findByRole('heading', { level: 1, name: '取引一覧' });
    expect((await db.transactions.get(id))?.amount).toBe(1_000);
    expect(await balanceOf(wallet)).toBe(4_300);
  });

  it('確認して削除すると取引が消え、残高が戻る', async () => {
    const { wallet, id } = await setupExpense();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { user } = await renderApp(`/transactions/${id}`);
    await user.click(await screen.findByRole('button', { name: 'この取引を削除' }));

    await screen.findByRole('heading', { level: 1, name: '取引一覧' });
    expect(window.confirm).toHaveBeenCalled();
    expect(await db.transactions.count()).toBe(0);
    expect(await balanceOf(wallet)).toBe(5_300);
  });

  it('削除をキャンセルすると取引は残る', async () => {
    const { id } = await setupExpense();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { user } = await renderApp(`/transactions/${id}`);
    await user.click(await screen.findByRole('button', { name: 'この取引を削除' }));
    expect(await db.transactions.count()).toBe(1);
    expect(screen.getByRole('heading', { level: 1, name: '取引の編集' })).toBeInTheDocument();
  });

  it('残高調整の編集では実際の残高を入力し直す', async () => {
    const { wallet } = await setup();
    const id = await saveTransaction(
      {
        type: 'adjustment',
        date: todayString(),
        amount: '5000',
        accountId: wallet,
        toAccountId: '',
        categoryId: '',
      },
      '',
    );
    const { user } = await renderApp(`/transactions/${id}`);
    const input = await screen.findByLabelText('実際の残高');
    expect(input).toHaveValue('5000');
    await user.clear(input);
    await user.type(input, '4800');
    await user.click(screen.getByRole('button', { name: '保存' }));
    await screen.findByRole('heading', { level: 1, name: '取引一覧' });
    expect((await db.transactions.get(id))?.amount).toBe(-500);
    expect(await balanceOf(wallet)).toBe(4_800);
  });
});
