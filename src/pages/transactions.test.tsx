import { within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addAccount,
  saveTransaction,
  setAccountHidden,
  setBudget,
  setCategoryHidden,
} from '../db/repository';
import { computeBalance } from '../domain/balance';
import { todayString } from '../domain/date';
import { db, renderApp, resetDb, screen, waitFor } from '../test/render';
import { ensureSeeded } from '../db/seed';
import { makeTx } from '../test/factories';

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

/** 口座・カテゴリのチップ群に並ぶ名前 */
const chipNames = (group: HTMLElement) =>
  within(group)
    .getAllByRole('button')
    .map((b) => b.textContent);

/** チップ群の中から名前でチップを探す（振替元・振替先には同名のチップが並ぶため） */
const chip = (group: HTMLElement, name: string) => within(group).getByRole('button', { name });

const categoryChipNames = () => chipNames(screen.getByRole('group', { name: 'カテゴリ' }));

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

  it('財布から支払う出費を保存すると残高が減り、入力画面にとどまる', async () => {
    const { wallet } = await setup();
    const { user } = await renderApp('/new');
    await user.type(screen.getByLabelText('金額'), '800');
    await user.click(await screen.findByRole('button', { name: '食費' }));
    await user.click(chip(screen.getByLabelText('支払元'), '財布'));
    await user.type(screen.getByLabelText('メモ'), 'コンビニ');
    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(await screen.findByTestId('saved-message')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: '入力' })).toBeInTheDocument();
    const [tx] = await db.transactions.toArray();
    expect(tx).toMatchObject({ type: 'expense', amount: 800, accountId: wallet, memo: 'コンビニ' });
    expect(await balanceOf(wallet)).toBe(4_500);
  });

  it('給与を銀行口座に記録する', async () => {
    const { bank, cat } = await setup();
    const { user } = await renderApp('/new');
    await user.click(screen.getByRole('button', { name: '収入' }));
    await user.type(screen.getByLabelText('金額'), '250000');
    await user.click(await screen.findByRole('button', { name: '給与' }));
    await user.click(chip(screen.getByLabelText('入金先'), 'A銀行'));
    await user.click(screen.getByRole('button', { name: '保存' }));

    await screen.findByTestId('saved-message');
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
    await user.click(chip(await screen.findByLabelText('支払元'), 'Aカード'));
    await user.click(screen.getByRole('button', { name: '保存' }));

    await screen.findByTestId('saved-message');
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
    await user.click(chip(await screen.findByLabelText('振替元'), 'A銀行'));
    await user.click(chip(screen.getByLabelText('振替先'), '財布'));
    await user.click(screen.getByRole('button', { name: '保存' }));

    await screen.findByTestId('saved-message');
    expect(await balanceOf(bank)).toBe(30_000);
    expect(await balanceOf(wallet)).toBe(25_300);
  });

  it('財布の残高を実際に合わせる', async () => {
    const { wallet } = await setup();
    const { user } = await renderApp('/new');
    await user.click(screen.getByRole('button', { name: '残高調整' }));
    await user.click(chip(await screen.findByLabelText('口座'), '財布'));
    expect(await screen.findByText('アプリ上の残高: ¥5,300')).toBeInTheDocument();
    await user.type(screen.getByLabelText('実際の残高'), '5000');
    await user.click(screen.getByRole('button', { name: '保存' }));

    await screen.findByTestId('saved-message');
    const [tx] = await db.transactions.toArray();
    expect(tx).toMatchObject({ type: 'adjustment', amount: -300 });
    expect(await balanceOf(wallet)).toBe(5_000);
  });
});

describe('連続入力', () => {
  const yesterday = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return todayString(d);
  };

  it('保存後は金額・メモ・カテゴリが初期状態に戻り、種類・日付・支払元は引き継がれる', async () => {
    await setup();
    const { user } = await renderApp('/new');
    await screen.findByRole('button', { name: '日用品' });
    const [defaultCategory] = categoryChipNames();
    const date = screen.getByLabelText('日付');
    await user.clear(date);
    await user.type(date, yesterday());
    await user.type(screen.getByLabelText('金額'), '3000');
    await user.click(screen.getByRole('button', { name: '日用品' }));
    await user.click(chip(screen.getByLabelText('支払元'), 'Aカード'));
    await user.type(screen.getByLabelText('メモ'), 'スーパー');
    await user.click(screen.getByRole('button', { name: '保存' }));

    await screen.findByTestId('saved-message');
    expect(screen.getByLabelText('金額')).toHaveValue('');
    expect(screen.getByLabelText('金額')).toHaveFocus();
    expect(screen.getByLabelText('メモ')).toHaveValue('');
    expect(screen.getByRole('button', { name: defaultCategory })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: '日用品' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: '出費' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('日付')).toHaveValue(yesterday());
    expect(chip(screen.getByLabelText('支払元'), 'Aカード')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('保存できなかったときは入力内容を残す', async () => {
    await setup();
    const { user } = await renderApp('/new');
    await screen.findByRole('group', { name: 'カテゴリ' });
    await user.type(screen.getByLabelText('メモ'), 'スーパー');
    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('金額は1〜999,999,999円');
    expect(screen.getByLabelText('メモ')).toHaveValue('スーパー');
  });

  it('保存すると内容を含む完了メッセージを表示し、次の保存で置き換える', async () => {
    await setup();
    const { user } = await renderApp('/new');
    await user.type(screen.getByLabelText('金額'), '800');
    await user.click(await screen.findByRole('button', { name: '食費' }));
    await user.click(screen.getByRole('button', { name: '保存' }));
    expect(await screen.findByTestId('saved-message')).toHaveTextContent(
      '保存しました（出費・食費 ¥800）',
    );

    await user.type(screen.getByLabelText('金額'), '300');
    await user.click(screen.getByRole('button', { name: '日用品' }));
    await user.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() =>
      expect(screen.getByTestId('saved-message')).toHaveTextContent(
        '保存しました（出費・日用品 ¥300）',
      ),
    );
    expect(screen.getAllByTestId('saved-message')).toHaveLength(1);
  });

  it('振替と残高調整の完了メッセージには口座名を含める', async () => {
    await setup();
    const { user } = await renderApp('/new');
    await user.click(screen.getByRole('button', { name: '振替' }));
    await user.type(screen.getByLabelText('金額'), '20000');
    await user.click(chip(await screen.findByLabelText('振替元'), 'A銀行'));
    await user.click(chip(screen.getByLabelText('振替先'), '財布'));
    await user.click(screen.getByRole('button', { name: '保存' }));
    expect(await screen.findByTestId('saved-message')).toHaveTextContent(
      '振替・A銀行→財布 ¥20,000',
    );

    await user.click(screen.getByRole('button', { name: '残高調整' }));
    await user.click(chip(await screen.findByLabelText('口座'), '財布'));
    await user.type(screen.getByLabelText('実際の残高'), '5000');
    await user.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() =>
      expect(screen.getByTestId('saved-message')).toHaveTextContent('残高調整・財布 ¥5,000'),
    );
  });

  it('保存に失敗したり別の画面へ移動したりすると完了メッセージは消える', async () => {
    await setup();
    const { user } = await renderApp('/new');
    await user.type(screen.getByLabelText('金額'), '800');
    await user.click(await screen.findByRole('button', { name: '食費' }));
    await user.click(screen.getByRole('button', { name: '保存' }));
    await screen.findByTestId('saved-message');

    await user.click(screen.getByRole('button', { name: '保存' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('金額は1〜999,999,999円');
    expect(screen.queryByTestId('saved-message')).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('金額'), '500');
    await user.click(screen.getByRole('button', { name: '保存' }));
    await screen.findByTestId('saved-message');
    await user.click(screen.getByRole('link', { name: /ホーム/ }));
    await screen.findByRole('heading', { level: 1, name: 'ホーム' });
    await user.click(screen.getByRole('link', { name: /入力/ }));
    await screen.findByRole('heading', { level: 1, name: '入力' });
    expect(screen.queryByTestId('saved-message')).not.toBeInTheDocument();
  });

  it('タブを押し直さずに 3 件続けて保存でき、取引一覧に 3 件表示される', async () => {
    await setup();
    const { user } = await renderApp('/new');
    await screen.findByRole('button', { name: '食費' });
    for (const amount of ['100', '200', '300']) {
      await user.type(screen.getByLabelText('金額'), amount);
      await user.click(screen.getByRole('button', { name: '保存' }));
      await waitFor(() =>
        expect(screen.getByTestId('saved-message')).toHaveTextContent(`¥${amount}`),
      );
    }
    expect(await db.transactions.count()).toBe(3);

    await user.click(screen.getByRole('link', { name: /取引一覧/ }));
    const list = await screen.findByRole('region', { name: '取引' });
    await waitFor(() => expect(within(list).getAllByRole('listitem')).toHaveLength(3));
  });
});

describe('口座の選択', () => {
  it('口座はチップを1タップで選び、選択を切り替えられる', async () => {
    await setup();
    const { user } = await renderApp('/new');
    const payFrom = await screen.findByRole('group', { name: '支払元' });
    await waitFor(() => expect(chipNames(payFrom)).toContain('Suica'));

    await user.click(chip(payFrom, '財布'));
    expect(chip(payFrom, '財布')).toHaveAttribute('aria-pressed', 'true');
    await user.click(chip(payFrom, 'Suica'));
    expect(chip(payFrom, 'Suica')).toHaveAttribute('aria-pressed', 'true');
    expect(chip(payFrom, '財布')).toHaveAttribute('aria-pressed', 'false');
  });
});

describe('選択肢の絞り込み', () => {
  it('クレジットカードは出費の支払元にだけ表示される', async () => {
    await setup();
    const { user } = await renderApp('/new');
    await waitFor(() =>
      expect(chipNames(screen.getByLabelText('支払元'))).toEqual([
        '財布',
        'A銀行',
        'Suica',
        'Aカード',
      ]),
    );

    await user.click(screen.getByRole('button', { name: '収入' }));
    expect(chipNames(screen.getByLabelText('入金先'))).toEqual(['財布', 'A銀行', 'Suica']);

    await user.click(screen.getByRole('button', { name: '振替' }));
    expect(chipNames(screen.getByLabelText('振替元'))).toEqual(['財布', 'A銀行', 'Suica']);
    expect(chipNames(screen.getByLabelText('振替先'))).toEqual(['財布', 'A銀行', 'Suica']);

    await user.click(screen.getByRole('button', { name: '残高調整' }));
    expect(chipNames(screen.getByLabelText('口座'))).toEqual(['財布', 'A銀行', 'Suica']);
  });

  it('非表示の口座とカテゴリは選択肢に出ない', async () => {
    const { card, cat } = await setup();
    await setAccountHidden(card, true);
    await setCategoryHidden(cat('Amazon'), true);
    await renderApp('/new');
    await waitFor(() =>
      expect(chipNames(screen.getByLabelText('支払元'))).toEqual(['財布', 'A銀行', 'Suica']),
    );
    await waitFor(() => expect(categoryChipNames()).toContain('食費'));
    expect(categoryChipNames()).not.toContain('Amazon');
  });

  it('カテゴリは種類ごとに出し分ける', async () => {
    await setup();
    const { user } = await renderApp('/new');
    await waitFor(() => expect(categoryChipNames()).toContain('食費'));
    expect(categoryChipNames()).toEqual([
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
    expect(categoryChipNames()).toEqual(['給与', '賞与', '副業', '臨時収入', 'その他']);
  });
});

describe('入力エラー', () => {
  it.each(['0', '-5', '1.5', ''])('金額「%s」は保存されない', async (input) => {
    await setup();
    const { user } = await renderApp('/new');
    await screen.findByRole('group', { name: 'カテゴリ' });
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
    await user.click(chip(await screen.findByLabelText('振替元'), 'A銀行'));
    await user.click(chip(screen.getByLabelText('振替先'), 'A銀行'));
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

describe('取引一覧のカテゴリ・支払元での絞り込み', () => {
  async function setupFilters() {
    const ids = await setup();
    const save = (
      type: 'expense' | 'income',
      date: string,
      amount: string,
      categoryId: string,
      accountId = ids.wallet,
    ) => saveTransaction({ type, date, amount, accountId, toAccountId: '', categoryId }, '');
    await save('expense', '2026-09-20', '900', ids.cat('食費'));
    await save('expense', '2026-09-15', '1000', ids.cat('日用品'), ids.card);
    await save('expense', '2026-10-03', '300', ids.cat('食費'));
    await save('expense', '2026-10-08', '500', ids.cat('食費'));
    await save('expense', '2026-10-04', '400', ids.cat('食費'), ids.card);
    await save('expense', '2026-10-05', '700', ids.cat('日用品'));
    // 入力画面からはカテゴリなしで保存できないので、古いデータを想定して直接入れる
    await db.transactions.add(
      makeTx({ type: 'expense', date: '2026-10-06', amount: 111, accountId: ids.wallet }),
    );
    await save('income', '2026-10-25', '250000', ids.cat('給与', 'income'));
    await saveTransaction(
      {
        type: 'transfer',
        date: '2026-10-07',
        amount: '20000',
        accountId: ids.bank,
        toAccountId: ids.wallet,
        categoryId: '',
      },
      '',
    );
    return ids;
  }

  /** 今日を 2026-10-10 にして取引一覧を開く */
  async function renderList(path: string) {
    vi.useFakeTimers({ now: new Date(2026, 9, 10), toFake: ['Date'] });
    const result = await renderApp(path);
    vi.useRealTimers();
    return result;
  }

  const rowTexts = () =>
    within(screen.getByRole('region', { name: '取引' }))
      .queryAllByRole('listitem')
      .map((li) => li.textContent ?? '');
  const rowDates = () => rowTexts().map((t) => t.slice(0, 5));

  const categoryGroup = () => screen.getByRole('group', { name: 'カテゴリ' });
  const accountGroup = () => screen.getByRole('group', { name: '支払元' });

  /** チップ群の中で選択状態のチップの名前 */
  const pressed = (group: HTMLElement) =>
    within(group)
      .getAllByRole('button')
      .filter((b) => b.getAttribute('aria-pressed') === 'true')
      .map((b) => b.textContent);

  it('絞り込みなしで開くと、両方の「すべて」が選ばれ、すべての取引を表示する', async () => {
    await setupFilters();
    await renderList('/transactions');
    await waitFor(() => expect(rowTexts()).toHaveLength(7));
    expect(pressed(categoryGroup())).toEqual(['すべて']);
    expect(pressed(accountGroup())).toEqual(['すべて']);
  });

  it('カテゴリには表示中の出費カテゴリを並べ、未分類の出費がある月だけ「未分類」を足す', async () => {
    const { cat } = await setupFilters();
    await setCategoryHidden(cat('Amazon'), true);
    const { user } = await renderList('/transactions');
    await waitFor(() => expect(rowTexts()).toHaveLength(7));
    expect(chipNames(categoryGroup())).toEqual([
      'すべて',
      '食費',
      '日用品',
      '交通費',
      '飲み会',
      '外食',
      '趣味・娯楽',
      '衣服',
      'その他',
      '未分類',
    ]);
    // 9月にはカテゴリのない出費がない
    await user.click(screen.getByRole('button', { name: '前月' }));
    await waitFor(() => expect(rowTexts()).toHaveLength(2));
    expect(chipNames(categoryGroup())).not.toContain('未分類');
  });

  it('支払元にはクレジットカードを含む表示中の口座を並べ、非表示の口座は出さない', async () => {
    const { suica } = await setupFilters();
    await setAccountHidden(suica, true);
    await renderList('/transactions');
    await waitFor(() => expect(rowTexts()).toHaveLength(7));
    expect(chipNames(accountGroup())).toEqual(['すべて', '財布', 'A銀行', 'Aカード']);
  });

  it('非表示のカテゴリ・口座でも、それで絞り込んでいるあいだは選択状態で残す', async () => {
    const { cat, card } = await setupFilters();
    await setCategoryHidden(cat('食費'), true);
    await setAccountHidden(card, true);
    await renderList(`/transactions?category=${cat('食費')}&account=${card}`);
    await waitFor(() => expect(rowTexts()).toHaveLength(1));
    expect(pressed(categoryGroup())).toEqual(['食費']);
    expect(pressed(accountGroup())).toEqual(['Aカード']);
  });

  it('カテゴリを選ぶと、その月のそのカテゴリの出費だけを新しい順に表示する', async () => {
    await setupFilters();
    const { user } = await renderList('/transactions');
    await waitFor(() => expect(rowTexts()).toHaveLength(7));
    await user.click(chip(categoryGroup(), '食費'));
    await waitFor(() => expect(rowDates()).toEqual(['10/08', '10/04', '10/03']));
    expect(pressed(categoryGroup())).toEqual(['食費']);
  });

  it('支払元を選ぶと、その口座から払った出費だけを表示し、収入・振替は出さない', async () => {
    await setupFilters();
    const { user } = await renderList('/transactions');
    await waitFor(() => expect(rowTexts()).toHaveLength(7));
    await user.click(chip(accountGroup(), '財布'));
    await waitFor(() => expect(rowDates()).toEqual(['10/08', '10/06', '10/05', '10/03']));
    expect(pressed(accountGroup())).toEqual(['財布']);
  });

  it('URL で支払元を指定して開ける', async () => {
    const { card } = await setupFilters();
    await renderList(`/transactions?account=${card}`);
    await waitFor(() => expect(rowDates()).toEqual(['10/04']));
  });

  it('カテゴリと支払元を両方選ぶと、両方に当てはまる出費だけを表示する', async () => {
    const { cat, wallet } = await setupFilters();
    await renderList(`/transactions?category=${cat('食費')}&account=${wallet}`);
    await waitFor(() => expect(rowDates()).toEqual(['10/08', '10/03']));
  });

  it('カテゴリの「すべて」を押すと、支払元の絞り込みは残る', async () => {
    const { cat, wallet } = await setupFilters();
    const { user } = await renderList(`/transactions?category=${cat('食費')}&account=${wallet}`);
    await waitFor(() => expect(rowTexts()).toHaveLength(2));
    await user.click(chip(categoryGroup(), 'すべて'));
    await waitFor(() => expect(rowTexts()).toHaveLength(4));
    expect(pressed(categoryGroup())).toEqual(['すべて']);
    expect(pressed(accountGroup())).toEqual(['財布']);
  });

  it('両方を「すべて」にすると、収入・振替を含むすべての取引を表示する', async () => {
    const { cat, wallet } = await setupFilters();
    const { user } = await renderList(`/transactions?category=${cat('食費')}&account=${wallet}`);
    await waitFor(() => expect(rowTexts()).toHaveLength(2));
    await user.click(chip(categoryGroup(), 'すべて'));
    await user.click(chip(accountGroup(), 'すべて'));
    await waitFor(() => expect(rowTexts()).toHaveLength(7));
  });

  it('「未分類」を選ぶと、カテゴリのない出費だけを表示する', async () => {
    await setupFilters();
    const { user } = await renderList('/transactions');
    await waitFor(() => expect(rowTexts()).toHaveLength(7));
    await user.click(chip(categoryGroup(), '未分類'));
    await waitFor(() => expect(rowDates()).toEqual(['10/06']));
  });

  it('月を切り替えても絞り込みが残る', async () => {
    const { card } = await setupFilters();
    const { user } = await renderList(`/transactions?account=${card}`);
    await waitFor(() => expect(rowDates()).toEqual(['10/04']));
    await user.click(screen.getByRole('button', { name: '前月' }));
    await waitFor(() => expect(rowDates()).toEqual(['09/15']));
    expect(pressed(accountGroup())).toEqual(['Aカード']);
  });

  it('条件に合う出費がない月は、その旨を表示し、選択肢は残す', async () => {
    const { cat } = await setupFilters();
    const { user } = await renderList(`/transactions?category=${cat('外食')}`);
    expect(await screen.findByText('条件に合う出費はありません')).toBeInTheDocument();
    expect(pressed(categoryGroup())).toEqual(['外食']);
    await user.click(screen.getByRole('button', { name: '前月' }));
    expect(await screen.findByText('条件に合う出費はありません')).toBeInTheDocument();
    expect(pressed(accountGroup())).toEqual(['すべて']);
  });

  it('絞り込んだ一覧から編集して保存すると、同じ絞り込みの一覧に戻る', async () => {
    const { cat, wallet } = await setupFilters();
    const { user } = await renderList(`/transactions?category=${cat('食費')}&account=${wallet}`);
    await waitFor(() => expect(rowTexts()).toHaveLength(2));
    await user.click(screen.getByRole('button', { name: /10\/08/ }));
    const amount = await screen.findByLabelText('金額');
    await user.clear(amount);
    await user.type(amount, '1200');
    await user.click(screen.getByRole('button', { name: '保存' }));

    await screen.findByRole('heading', { level: 1, name: '取引一覧' });
    await waitFor(() => expect(rowTexts()).toHaveLength(2));
    expect(rowTexts()[0]).toContain('1,200');
    expect(pressed(categoryGroup())).toEqual(['食費']);
    expect(pressed(accountGroup())).toEqual(['財布']);
  });

  it('絞り込んだ一覧から削除しても、同じ絞り込みの一覧に戻る', async () => {
    const { cat } = await setupFilters();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { user } = await renderList(`/transactions?category=${cat('食費')}`);
    await waitFor(() => expect(rowTexts()).toHaveLength(3));
    await user.click(screen.getByRole('button', { name: /10\/08/ }));
    await user.click(await screen.findByRole('button', { name: 'この取引を削除' }));

    await screen.findByRole('heading', { level: 1, name: '取引一覧' });
    await waitFor(() => expect(rowTexts()).toHaveLength(2));
    expect(pressed(categoryGroup())).toEqual(['食費']);
  });

  it('下部タブの「取引一覧」からは絞り込みなしで開く', async () => {
    const { wallet } = await setupFilters();
    const { user } = await renderList(`/transactions?account=${wallet}`);
    await waitFor(() => expect(rowTexts()).toHaveLength(4));
    await user.click(screen.getByRole('link', { name: /取引一覧/ }));
    await waitFor(() => expect(rowTexts()).toHaveLength(7));
    expect(pressed(categoryGroup())).toEqual(['すべて']);
    expect(pressed(accountGroup())).toEqual(['すべて']);
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

describe('出費保存時の予算アラート', () => {
  const month = todayString().slice(0, 7);

  async function setupBudget(budget: string, spent: string) {
    const ids = await setup();
    await setBudget(ids.cat('外食'), month, budget);
    if (spent !== '0') {
      await saveTransaction(
        {
          type: 'expense',
          date: todayString(),
          amount: spent,
          accountId: ids.wallet,
          toAccountId: '',
          categoryId: ids.cat('外食'),
        },
        '',
      );
    }
    return ids;
  }

  async function saveEatOut(amount: string) {
    const result = await renderApp('/new');
    const { user } = result;
    await user.type(screen.getByLabelText('金額'), amount);
    await user.click(await screen.findByRole('button', { name: '外食' }));
    await user.click(screen.getByRole('button', { name: '保存' }));
    await screen.findByTestId('saved-message');
    return result;
  }

  it('保存で予算を超えたら、入力画面でメッセージを表示する', async () => {
    await setupBudget('10000', '8000');
    await saveEatOut('3000');
    expect(await screen.findByTestId('budget-alert')).toHaveTextContent(
      '外食が予算を超過しました（¥11,000 / ¥10,000）',
    );
  });

  it('予算の80%に達したら、注意のメッセージを表示する', async () => {
    await setupBudget('10000', '7000');
    await saveEatOut('1000');
    const alert = await screen.findByTestId('budget-alert');
    expect(alert).toHaveTextContent('外食が予算の80%に達しました（¥8,000 / ¥10,000）');
    expect(alert).toHaveClass('warning');
  });

  it('予算内なら表示しない', async () => {
    await setupBudget('10000', '0');
    await saveEatOut('1000');
    expect(screen.queryByTestId('budget-alert')).not.toBeInTheDocument();
  });

  it('予算内の出費を続けて保存すると、直前のメッセージは消える', async () => {
    await setupBudget('10000', '9000');
    const { user } = await saveEatOut('2000');
    expect(await screen.findByTestId('budget-alert')).toBeInTheDocument();

    await user.type(screen.getByLabelText('金額'), '100');
    await user.click(screen.getByRole('button', { name: '食費' }));
    await user.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => expect(screen.getByTestId('saved-message')).toHaveTextContent('食費'));
    expect(screen.queryByTestId('budget-alert')).not.toBeInTheDocument();
  });

  it('閉じると消え、別の画面へ移動しても消える', async () => {
    await setupBudget('10000', '9000');
    const { user } = await saveEatOut('2000');
    await user.click(await screen.findByRole('button', { name: '予算のお知らせを閉じる' }));
    expect(screen.queryByTestId('budget-alert')).not.toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: /入力/ }));
    await user.type(screen.getByLabelText('金額'), '100');
    await user.click(await screen.findByRole('button', { name: '外食' }));
    await user.click(screen.getByRole('button', { name: '保存' }));
    expect(await screen.findByTestId('budget-alert')).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: /取引一覧/ }));
    await screen.findByRole('heading', { level: 1, name: '取引一覧' });
    expect(screen.queryByTestId('budget-alert')).not.toBeInTheDocument();
  });

  it('編集して保存すると、取引一覧でメッセージを表示する', async () => {
    await setupBudget('10000', '5000');
    const [tx] = await db.transactions.toArray();
    const { user } = await renderApp(`/transactions/${tx.id}`);
    const amount = await screen.findByLabelText('金額');
    await user.clear(amount);
    await user.type(amount, '12000');
    await user.click(screen.getByRole('button', { name: '保存' }));

    await screen.findByRole('heading', { level: 1, name: '取引一覧' });
    expect(await screen.findByTestId('budget-alert')).toHaveTextContent(
      '外食が予算を超過しました（¥12,000 / ¥10,000）',
    );
  });
});

describe('取引一覧のカレンダー', () => {
  async function setupDays() {
    const ids = await setup();
    const save = (
      type: 'expense' | 'income',
      date: string,
      amount: string,
      categoryId: string,
      accountId = ids.wallet,
    ) => saveTransaction({ type, date, amount, accountId, toAccountId: '', categoryId }, '');
    await save('expense', '2026-10-05', '800', ids.cat('食費'));
    await save('expense', '2026-10-05', '1200', ids.cat('日用品'));
    await save('income', '2026-10-05', '3000', ids.cat('給与', 'income'), ids.bank);
    await save('expense', '2026-10-08', '500', ids.cat('食費'));
    await save('expense', '2026-09-05', '900', ids.cat('食費'));
    await saveTransaction(
      {
        type: 'transfer',
        date: '2026-10-05',
        amount: '10000',
        accountId: ids.bank,
        toAccountId: ids.wallet,
        categoryId: '',
      },
      '',
    );
    return ids;
  }

  /** 今日を 2026-10-10 にして取引一覧を開く */
  async function renderList(path: string) {
    vi.useFakeTimers({ now: new Date(2026, 9, 10), toFake: ['Date'] });
    const result = await renderApp(path);
    vi.useRealTimers();
    return result;
  }

  const calendar = () => screen.getByRole('region', { name: 'カレンダー' });
  /** カレンダーの日の枠。名前は「10月5日 出費 ¥2,000 収入 ¥3,000」の形なので、日付の部分で探す */
  const dayCell = (label: string) =>
    within(calendar()).getByRole('button', { name: new RegExp(`^${label}( |$)`) });
  const rowDates = () =>
    within(screen.getByRole('region', { name: '取引' }))
      .queryAllByRole('listitem')
      .map((li) => (li.textContent ?? '').slice(0, 5));
  const categoryGroup = () => screen.getByRole('group', { name: 'カテゴリ' });

  it('日の枠に出費・収入の合計を出し、振替は含めない', async () => {
    await setupDays();
    await renderList('/transactions');
    await waitFor(() =>
      expect(dayCell('10月5日')).toHaveAccessibleName('10月5日 出費 ¥2,000 収入 ¥3,000'),
    );
    expect(dayCell('10月5日')).toHaveTextContent('-¥2,000');
    expect(dayCell('10月5日')).toHaveTextContent('+¥3,000');
  });

  it('取引のない日は日付だけを出す', async () => {
    await setupDays();
    await renderList('/transactions');
    await waitFor(() => expect(rowDates()).toHaveLength(5));
    expect(dayCell('10月6日')).toHaveAccessibleName('10月6日');
    expect(dayCell('10月6日')).toHaveTextContent(/^6$/);
  });

  it('月の日だけを枠に並べ、前後の月の日は出さない', async () => {
    await setupDays();
    await renderList('/transactions');
    await waitFor(() => expect(rowDates()).toHaveLength(5));
    expect(within(calendar()).getAllByRole('button')).toHaveLength(31);
    expect(within(calendar()).queryByRole('button', { name: /^(9|11)月/ })).toBeNull();
  });

  it('今日の日付の枠を区別する', async () => {
    await setupDays();
    vi.useFakeTimers({ now: new Date(2026, 9, 10), toFake: ['Date'] });
    try {
      await renderApp('/transactions');
      await waitFor(() => expect(rowDates()).toHaveLength(5));
      expect(dayCell('10月10日')).toHaveAttribute('aria-current', 'date');
      expect(dayCell('10月9日')).not.toHaveAttribute('aria-current');
    } finally {
      vi.useRealTimers();
    }
  });

  it('カテゴリで絞り込むと、その出費だけを出し、収入は出さない', async () => {
    await setupDays();
    const { user } = await renderList('/transactions');
    await waitFor(() => expect(rowDates()).toHaveLength(5));
    await user.click(chip(categoryGroup(), '食費'));
    await waitFor(() => expect(dayCell('10月5日')).toHaveAccessibleName('10月5日 出費 ¥800'));
  });

  it('月を切り替えると、その月の日の合計を出す', async () => {
    await setupDays();
    const { user } = await renderList('/transactions');
    await waitFor(() => expect(rowDates()).toHaveLength(5));
    await user.click(screen.getByRole('button', { name: '前月' }));
    await waitFor(() => expect(dayCell('9月5日')).toHaveAccessibleName('9月5日 出費 ¥900'));
  });

  it('日の枠を押すとその日の取引だけを表示し、もう一度押すと解除する', async () => {
    await setupDays();
    const { user } = await renderList('/transactions');
    await waitFor(() => expect(rowDates()).toHaveLength(5));
    await user.click(dayCell('10月5日'));
    await waitFor(() => expect(rowDates()).toEqual(['10/05', '10/05', '10/05', '10/05']));
    expect(dayCell('10月5日')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('10月5日の取引')).toBeInTheDocument();

    await user.click(dayCell('10月5日'));
    await waitFor(() => expect(rowDates()).toHaveLength(5));
    expect(dayCell('10月5日')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByText('10月5日の取引')).toBeNull();
  });

  it('解除を押すと日付の絞り込みだけを外し、カテゴリの絞り込みは残す', async () => {
    const { cat } = await setupDays();
    const { user } = await renderList(`/transactions?category=${cat('食費')}&date=2026-10-05`);
    await waitFor(() => expect(rowDates()).toEqual(['10/05']));
    await user.click(screen.getByRole('button', { name: '日付の絞り込みを解除' }));
    await waitFor(() => expect(rowDates()).toEqual(['10/08', '10/05']));
  });

  it('日付を選んでからカテゴリを選ぶと、両方に当てはまる出費だけを表示する', async () => {
    await setupDays();
    const { user } = await renderList('/transactions');
    await waitFor(() => expect(rowDates()).toHaveLength(5));
    await user.click(dayCell('10月5日'));
    await user.click(chip(categoryGroup(), '食費'));
    await waitFor(() => expect(rowDates()).toEqual(['10/05']));
    expect(dayCell('10月5日')).toHaveAttribute('aria-pressed', 'true');
  });

  it('その日に取引がなければ、その旨を表示する', async () => {
    await setupDays();
    const { user } = await renderList('/transactions');
    await waitFor(() => expect(rowDates()).toHaveLength(5));
    await user.click(dayCell('10月6日'));
    expect(await screen.findByText('この日の取引はありません')).toBeInTheDocument();
  });

  it('月を切り替えると日付の絞り込みが外れる', async () => {
    await setupDays();
    const { user } = await renderList('/transactions?date=2026-10-05');
    await waitFor(() => expect(rowDates()).toHaveLength(4));
    await user.click(screen.getByRole('button', { name: '前月' }));
    await waitFor(() => expect(rowDates()).toEqual(['09/05']));
    expect(screen.queryByText(/の取引$/)).toBeNull();
    // 元の月に戻っても日付の絞り込みは戻らない
    await user.click(screen.getByRole('button', { name: '次月' }));
    await waitFor(() => expect(rowDates()).toHaveLength(5));
  });

  it('日付で絞り込んだ一覧から編集して保存すると、同じ日付の一覧に戻る', async () => {
    await setupDays();
    const { user } = await renderList('/transactions?date=2026-10-08');
    await waitFor(() => expect(rowDates()).toEqual(['10/08']));
    await user.click(screen.getByRole('button', { name: /10\/08/ }));
    const amount = await screen.findByLabelText('金額');
    await user.clear(amount);
    await user.type(amount, '650');
    await user.click(screen.getByRole('button', { name: '保存' }));

    await screen.findByRole('heading', { level: 1, name: '取引一覧' });
    await waitFor(() => expect(dayCell('10月8日')).toHaveAccessibleName('10月8日 出費 ¥650'));
    expect(rowDates()).toEqual(['10/08']);
    expect(screen.getByText('10月8日の取引')).toBeInTheDocument();
  });
});
