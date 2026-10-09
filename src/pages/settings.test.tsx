import { within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { addAccount, saveTransaction } from '../db/repository';
import { ensureSeeded } from '../db/seed';
import { computeBalance } from '../domain/balance';
import { db, renderApp, resetDb, screen, waitFor } from '../test/render';

beforeEach(resetDb);

const accountsSection = () => screen.getByRole('region', { name: '口座・カード' });
const addForm = () => screen.getByRole('form', { name: '口座の追加' });

describe('口座管理', () => {
  it('初期残高を指定して銀行口座を複数登録できる', async () => {
    const { user } = await renderApp('/settings');
    const form = addForm();
    for (const [name, balance] of [
      ['A銀行', '120000'],
      ['B銀行', '30000'],
    ]) {
      await user.selectOptions(within(form).getByLabelText('種別'), '銀行');
      await user.type(within(form).getByLabelText('口座名'), name);
      await user.type(within(form).getByLabelText('初期残高'), balance);
      await user.click(within(form).getByRole('button', { name: '追加' }));
    }
    const banks = await within(accountsSection()).findByRole('group', { name: '銀行' });
    await waitFor(() => expect(within(banks).getAllByRole('listitem')).toHaveLength(2));
    expect(banks).toHaveTextContent('A銀行（初期残高 ¥120,000）');
    const a = (await db.accounts.toArray()).find((x) => x.name === 'A銀行')!;
    expect(computeBalance(a, [])).toBe(120_000);
  });

  it('クレジットカードは名前だけで登録でき、複数枚持てる', async () => {
    const { user } = await renderApp('/settings');
    const form = addForm();
    await user.selectOptions(within(form).getByLabelText('種別'), 'クレジットカード');
    expect(within(form).queryByLabelText('初期残高')).not.toBeInTheDocument();
    await user.type(within(form).getByLabelText('口座名'), 'Aカード');
    await user.click(within(form).getByRole('button', { name: '追加' }));
    await user.type(within(form).getByLabelText('口座名'), 'Bカード');
    await user.click(within(form).getByRole('button', { name: '追加' }));

    const cards = await within(accountsSection()).findByRole('group', { name: 'クレジットカード' });
    await waitFor(() => expect(within(cards).getAllByRole('listitem')).toHaveLength(2));
    expect(cards).not.toHaveTextContent('初期残高');
    const saved = (await db.accounts.where('type').equals('credit').toArray()).map(
      (a) => a.initialBalance,
    );
    expect(saved).toEqual([0, 0]);
  });

  it('名前が空の口座は登録できない', async () => {
    const { user } = await renderApp('/settings');
    await user.click(within(addForm()).getByRole('button', { name: '追加' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('名前を入力してください');
    expect(await db.accounts.count()).toBe(1); // 既定の「財布」だけ
  });

  it('不正な初期残高は登録できない', async () => {
    const { user } = await renderApp('/settings');
    const form = addForm();
    await user.type(within(form).getByLabelText('口座名'), 'A銀行');
    await user.type(within(form).getByLabelText('初期残高'), '-100');
    await user.click(within(form).getByRole('button', { name: '追加' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('初期残高は0以上の整数');
    expect(await db.accounts.count()).toBe(1);
  });

  it('名前と初期残高を編集でき、残高に反映される', async () => {
    await ensureSeeded();
    const id = await addAccount({ name: 'A銀行', type: 'bank', initialBalance: 120_000 });
    const { user } = await renderApp('/settings');
    await user.click(await screen.findByRole('button', { name: 'A銀行を編集' }));
    const row = screen.getByLabelText('口座名', { selector: '.list input' }).closest('li')!;
    const balance = within(row).getByLabelText('初期残高');
    await user.clear(balance);
    await user.type(balance, '100000');
    await user.click(within(row).getByRole('button', { name: '保存' }));

    await screen.findByText('（初期残高 ¥100,000）');
    expect(computeBalance((await db.accounts.get(id))!, [])).toBe(100_000);
  });

  it('解約したカードを非表示にすると支払元から消え、過去の取引は残る。再表示もできる', async () => {
    await ensureSeeded();
    const card = await addAccount({ name: 'Aカード', type: 'credit' });
    const food = (await db.categories.toArray()).find((c) => c.name === '食費')!.id;
    await saveTransaction(
      {
        type: 'expense',
        date: '2026-10-01',
        amount: '500',
        accountId: card,
        toAccountId: '',
        categoryId: food,
      },
      '',
    );
    const { user } = await renderApp('/settings');
    await user.click(await screen.findByRole('button', { name: 'Aカードを非表示' }));
    const hiddenGroup = await screen.findByRole('group', { name: '非表示の口座' });
    expect(hiddenGroup).toHaveTextContent('Aカード（クレジットカード）');
    expect(await db.transactions.count()).toBe(1);

    await user.click(screen.getByRole('link', { name: /入力/ }));
    const payFrom = await screen.findByLabelText('支払元');
    expect(within(payFrom).queryByRole('option', { name: 'Aカード' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: /設定/ }));
    await user.click(await screen.findByRole('button', { name: 'Aカードを再表示' }));
    await waitFor(async () => expect((await db.accounts.get(card))?.hidden).toBe(false));
    await user.click(screen.getByRole('link', { name: /入力/ }));
    const payFrom2 = await screen.findByLabelText('支払元');
    await waitFor(() =>
      expect(within(payFrom2).getByRole('option', { name: 'Aカード' })).toBeInTheDocument(),
    );
  });
});

describe('カテゴリ管理', () => {
  const categoriesSection = () => screen.getByRole('region', { name: 'カテゴリ' });

  it('出費カテゴリを追加すると入力の選択肢に出る', async () => {
    const { user } = await renderApp('/settings');
    const section = categoriesSection();
    await within(section).findByText('食費');
    await user.type(within(section).getByLabelText('新しいカテゴリ名'), 'サブスク');
    await user.click(within(section).getByRole('button', { name: '追加' }));
    await within(section).findByText('サブスク');

    await user.click(screen.getByRole('link', { name: /入力/ }));
    const select = await screen.findByLabelText('カテゴリ');
    await waitFor(() =>
      expect(within(select).getByRole('option', { name: 'サブスク' })).toBeInTheDocument(),
    );
  });

  it('重複した名前は登録できない', async () => {
    const { user } = await renderApp('/settings');
    const section = categoriesSection();
    await within(section).findByText('食費');
    await user.type(within(section).getByLabelText('新しいカテゴリ名'), '食費');
    await user.click(within(section).getByRole('button', { name: '追加' }));
    expect(await within(section).findByRole('alert')).toHaveTextContent('同じ名前がすでにあります');
  });

  it('収入カテゴリに切り替えて追加できる', async () => {
    const { user } = await renderApp('/settings');
    const section = categoriesSection();
    await user.click(within(section).getByRole('button', { name: '収入' }));
    await within(section).findByText('給与');
    await user.type(within(section).getByLabelText('新しいカテゴリ名'), 'ポイント');
    await user.click(within(section).getByRole('button', { name: '追加' }));
    await within(section).findByText('ポイント');
    const added = (await db.categories.toArray()).find((c) => c.name === 'ポイント');
    expect(added?.kind).toBe('income');
  });

  it('名前変更が過去の取引に反映される', async () => {
    await ensureSeeded();
    const wallet = (await db.accounts.toArray())[0].id;
    const hobby = (await db.categories.toArray()).find((c) => c.name === '趣味・娯楽')!.id;
    const today = new Date();
    const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
    await saveTransaction(
      {
        type: 'expense',
        date,
        amount: '1000',
        accountId: wallet,
        toAccountId: '',
        categoryId: hobby,
      },
      '',
    );
    const { user } = await renderApp('/settings');
    await user.click(await screen.findByRole('button', { name: '趣味・娯楽の名前を変更' }));
    const input = screen.getByLabelText('カテゴリ名');
    await user.clear(input);
    await user.type(input, '趣味');
    await user.click(within(input.closest('li')!).getByRole('button', { name: '保存' }));

    await user.click(screen.getByRole('link', { name: /取引一覧/ }));
    const list = await screen.findByRole('region', { name: '取引' });
    await waitFor(() => expect(list).toHaveTextContent('趣味'));
    expect(list).not.toHaveTextContent('趣味・娯楽');

    await user.click(screen.getByRole('link', { name: /ホーム/ }));
    const breakdown = await screen.findByRole('region', { name: 'カテゴリ別の出費' });
    await waitFor(() => expect(breakdown).toHaveTextContent('趣味¥1,000'));
  });

  it('非表示にしたカテゴリは入力の選択肢から消え、内訳には残る。再表示もできる', async () => {
    await ensureSeeded();
    const wallet = (await db.accounts.toArray())[0].id;
    const amazon = (await db.categories.toArray()).find((c) => c.name === 'Amazon')!.id;
    const today = new Date();
    const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
    await saveTransaction(
      {
        type: 'expense',
        date,
        amount: '2500',
        accountId: wallet,
        toAccountId: '',
        categoryId: amazon,
      },
      '',
    );
    const { user } = await renderApp('/settings');
    await user.click(await screen.findByRole('button', { name: 'Amazonを非表示' }));
    await screen.findByRole('group', { name: '非表示のカテゴリ' });

    await user.click(screen.getByRole('link', { name: /入力/ }));
    const select = await screen.findByLabelText('カテゴリ');
    expect(within(select).queryByRole('option', { name: 'Amazon' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: /ホーム/ }));
    const breakdown = await screen.findByRole('region', { name: 'カテゴリ別の出費' });
    await waitFor(() => expect(breakdown).toHaveTextContent('Amazon¥2,500'));

    await user.click(screen.getByRole('link', { name: /設定/ }));
    await user.click(await screen.findByRole('button', { name: 'Amazonを再表示' }));
    await waitFor(async () => expect((await db.categories.get(amazon))?.hidden).toBe(false));
  });
});
