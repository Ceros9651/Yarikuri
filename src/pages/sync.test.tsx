import { fireEvent, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { createBackup } from '../domain/backup';
import { exportData } from '../db/backup';
import { YarikuriDB } from '../db/db';
import { saveTransaction } from '../db/repository';
import { ensureSeeded } from '../db/seed';
import { UNCONFIGURED_MESSAGE } from '../sync/config';
import { linkDevice } from '../sync/engine';
import { SyncError } from '../sync/remote';
import { SIGN_OUT_CONFIRM, UPLOAD_CONFIRM, type SyncOptions } from '../sync/SyncContext';
import { FakeAuth, FakeCloud } from '../test/fakeCloud';
import { db, renderApp, resetDb, screen, waitFor } from '../test/render';

const UID = 'user-1';
let cloud: FakeCloud;
let auth: FakeAuth;
let loadServices: ReturnType<typeof vi.fn<NonNullable<SyncOptions['loadServices']>>>;
let others: YarikuriDB[] = [];

beforeEach(async () => {
  await resetDb();
  await ensureSeeded(db);
  cloud = new FakeCloud();
  auth = new FakeAuth();
  loadServices = vi.fn(async () => ({ auth, createRemote: (uid: string) => cloud.remote(uid) }));
});

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(others.map((d) => d.delete()));
  others = [];
});

const options = (): SyncOptions => ({ loadServices, configured: true });
const section = () => screen.getByRole('region', { name: '同期' });
const inSection = () => within(section());

/** 別の端末からクラウドにデータを入れておく。prepare で送る前の端末に記録を足せる */
async function cloudWithData(prepare?: (other: YarikuriDB) => Promise<unknown>) {
  const other = new YarikuriDB(`other-${Math.random()}`);
  others.push(other);
  await ensureSeeded(other);
  await prepare?.(other);
  await linkDevice(other, cloud.remote(UID), UID, {
    confirmUpload: async () => true,
    confirmReplace: async () => true,
  });
  return other;
}

async function addExpense(target = db, amount = '1200') {
  const wallet = (await target.accounts.toArray())[0].id;
  const food = (await target.categories.toArray()).find((c) => c.name === '食費')!.id;
  return saveTransaction(
    {
      type: 'expense',
      date: '2026-10-15',
      amount,
      accountId: wallet,
      toAccountId: '',
      categoryId: food,
    },
    '',
    undefined,
    target,
  );
}

async function signInAsFirstDevice() {
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  const rendered = await renderApp('/settings', options());
  await rendered.user.click(inSection().getByRole('button', { name: 'Google でサインイン' }));
  await waitFor(() => expect(inSection().getByText('me@example.com でサインインしています')));
  return rendered;
}

function goOffline() {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  cloud.setOnline(false);
  fireEvent(window, new Event('offline'));
}

describe('未サインイン', () => {
  it('説明と「Google でサインイン」を出し、押す前に Firebase を準備しておく', async () => {
    const signIn = vi.spyOn(auth, 'signIn');
    await renderApp('/settings', options());
    expect(inSection().getByText(/同じ Google アカウントでサインインした端末/)).toBeInTheDocument();
    expect(inSection().getByRole('button', { name: 'Google でサインイン' })).toBeEnabled();
    // iPhone はボタンを押した直後にしかポップアップを開かせないため、押す前に読み込みを済ませる
    await waitFor(() => expect(loadServices).toHaveBeenCalledOnce());
    expect(signIn).not.toHaveBeenCalled();
  });

  it('設定画面を開かなければ Firebase を読み込まない', async () => {
    await renderApp('/', options());
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(loadServices).not.toHaveBeenCalled();
  });

  it('接続設定の無いビルドでは設定画面を開いても Firebase を読み込まない', async () => {
    await renderApp('/settings', { loadServices, configured: false });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(loadServices).not.toHaveBeenCalled();
  });

  it('接続設定の無いビルドでは理由を出し、サインインできない', async () => {
    await renderApp('/settings', { loadServices, configured: false });
    expect(inSection().getByText(UNCONFIGURED_MESSAGE)).toBeInTheDocument();
    expect(inSection().getByRole('button', { name: 'Google でサインイン' })).toBeDisabled();
  });

  it('アカウント選択を閉じるとサインインしていない状態のままで、データは変わらない', async () => {
    auth.next = null;
    const before = await exportData();
    const { user } = await renderApp('/settings', options());
    await user.click(inSection().getByRole('button', { name: 'Google でサインイン' }));
    await waitFor(() =>
      expect(inSection().getByRole('button', { name: 'Google でサインイン' })).toBeEnabled(),
    );
    expect(await exportData()).toEqual(before);
    expect(cloud.isInitialized(UID)).toBe(false);
  });
});

describe('初めてサインインした端末', () => {
  it('クラウドが空なら確認のうえ端末のデータを送り、同期済みと表示する', async () => {
    const id = await addExpense();
    await signInAsFirstDevice();
    expect(window.confirm).toHaveBeenCalledWith(UPLOAD_CONFIRM);
    expect(cloud.isInitialized(UID)).toBe(true);
    expect(cloud.stored(UID, 'transactions').has(id)).toBe(true);
    await waitFor(() =>
      expect(inSection().getByTestId('pending')).toHaveTextContent('送れていない変更はありません'),
    );
    expect(inSection().getByTestId('last-synced')).not.toHaveTextContent('まだ同期していません');
  });

  it('送る前の確認でキャンセルすると、サインアウトしてデータも変えない', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { user } = await renderApp('/settings', options());
    await user.click(inSection().getByRole('button', { name: 'Google でサインイン' }));
    await waitFor(() =>
      expect(inSection().getByRole('button', { name: 'Google でサインイン' })).toBeEnabled(),
    );
    expect(auth.user).toBeNull();
    expect(cloud.isInitialized(UID)).toBe(false);
  });

  it('取引のない端末は、確認なしでクラウドの内容になる', async () => {
    let fromOther = '';
    const other = await cloudWithData(async (o) => (fromOther = await addExpense(o, '3000')));
    const confirm = vi.spyOn(window, 'confirm');
    const { user } = await renderApp('/settings', options());
    await user.click(inSection().getByRole('button', { name: 'Google でサインイン' }));
    await waitFor(() => expect(inSection().getByText('me@example.com でサインインしています')));
    expect(confirm).not.toHaveBeenCalled();
    expect(await db.accounts.toArray()).toEqual(await other.accounts.toArray());
    expect(await db.transactions.get(fromOther)).toMatchObject({ amount: 3000 });
  });

  it('取引のある端末は置き換えの確認を出し、キャンセルすると何も変わらない', async () => {
    await cloudWithData();
    const local = await addExpense();
    const { user } = await renderApp('/settings', options());
    await user.click(inSection().getByRole('button', { name: 'Google でサインイン' }));

    const prompt = await waitFor(() =>
      inSection().getByRole('group', { name: 'この端末のデータの置き換え' }),
    );
    expect(prompt).toHaveTextContent('取引1件');
    await user.click(within(prompt).getByRole('button', { name: 'キャンセル' }));

    await waitFor(() =>
      expect(inSection().getByRole('button', { name: 'Google でサインイン' })).toBeEnabled(),
    );
    expect(await db.transactions.get(local)).toBeDefined();
    expect(auth.user).toBeNull();
  });

  it('置き換えの確認で書き出してから置き換えられる', async () => {
    const other = await cloudWithData();
    const local = await addExpense();
    URL.createObjectURL = vi.fn(() => 'blob:backup');
    URL.revokeObjectURL = vi.fn();
    onTestFinished(() => {
      Reflect.deleteProperty(URL, 'createObjectURL');
      Reflect.deleteProperty(URL, 'revokeObjectURL');
    });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    const { user } = await renderApp('/settings', options());
    await user.click(inSection().getByRole('button', { name: 'Google でサインイン' }));
    const prompt = await waitFor(() =>
      inSection().getByRole('group', { name: 'この端末のデータの置き換え' }),
    );
    await user.click(within(prompt).getByRole('button', { name: 'ファイルに書き出す' }));
    await waitFor(() => expect(within(prompt).getByText(/を書き出しました/)));
    expect(click).toHaveBeenCalled();

    await user.click(within(prompt).getByRole('button', { name: '置き換える' }));
    await waitFor(() => expect(inSection().getByText('me@example.com でサインインしています')));
    expect(await db.transactions.get(local)).toBeUndefined();
    expect(await db.accounts.toArray()).toEqual(await other.accounts.toArray());
  });

  it('オフラインでは「通信が必要」と出してサインインしない', async () => {
    cloud.setOnline(false);
    const { user } = await renderApp('/settings', options());
    await user.click(inSection().getByRole('button', { name: 'Google でサインイン' }));
    await waitFor(() =>
      expect(inSection().getByRole('status')).toHaveTextContent(
        '初めてのサインインには通信が必要です',
      ),
    );
    expect(auth.user).toBeNull();
  });
});

describe('サインイン中', () => {
  it('他の端末で記録した取引が、開いている画面に反映される', async () => {
    const other = await cloudWithData();
    const { user } = await renderApp('/settings', options());
    await user.click(inSection().getByRole('button', { name: 'Google でサインイン' }));
    await waitFor(() => expect(inSection().getByText('me@example.com でサインインしています')));

    const id = await addExpense(other, '4321');
    // 他の端末の送信は、テストでは直接クラウドへ書く
    const record = await other.transactions.get(id);
    await cloud.remote(UID).write([{ table: 'transactions', docId: id, record: record! }]);
    await waitFor(async () =>
      expect(await db.transactions.get(id)).toMatchObject({ amount: 4321 }),
    );
  });

  it('オフラインで記録すると、送れていない変更があり通信が戻ったら送ると表示する', async () => {
    await signInAsFirstDevice();
    goOffline();
    await addExpense();
    await waitFor(() =>
      expect(inSection().getByTestId('pending')).toHaveTextContent(
        'オフラインのため、送れていない変更は通信が戻ったら送ります',
      ),
    );
  });

  it('同期に失敗したら理由を表示する', async () => {
    await signInAsFirstDevice();
    cloud.failure = new SyncError('quota', 'Quota exceeded');
    await addExpense();
    await waitFor(() =>
      expect(inSection().getByRole('status')).toHaveTextContent('無料枠の1日の上限'),
    );
  });

  it('サインアウトしても端末のデータは残り、未サインインの表示に戻る', async () => {
    const { user } = await signInAsFirstDevice();
    const id = await addExpense();
    await waitFor(() =>
      expect(inSection().getByTestId('pending')).toHaveTextContent('送れていない変更はありません'),
    );
    await user.click(inSection().getByRole('button', { name: 'サインアウト' }));
    await waitFor(() =>
      expect(inSection().getByRole('button', { name: 'Google でサインイン' })).toBeEnabled(),
    );
    expect(await db.transactions.get(id)).toBeDefined();
    expect(await db.meta.get('syncUid')).toBeUndefined();
    expect(auth.user).toBeNull();
  });

  it('送れていない変更があるときのサインアウトは確認し、キャンセルするとサインインしたまま', async () => {
    const { user } = await signInAsFirstDevice();
    goOffline();
    await addExpense();
    const confirm = vi.mocked(window.confirm);
    confirm.mockClear();
    confirm.mockReturnValue(false);

    await user.click(inSection().getByRole('button', { name: 'サインアウト' }));
    expect(confirm).toHaveBeenCalledWith(SIGN_OUT_CONFIRM);
    expect(inSection().getByText('me@example.com でサインインしています')).toBeInTheDocument();
    expect(auth.user).not.toBeNull();
  });

  it('同期している端末は、起動するとサインインし直さずに同期を再開する', async () => {
    await db.meta.put({ key: 'syncUid', value: UID });
    auth.user = { uid: UID, email: 'me@example.com' };
    cloud.remote(UID).markInitialized();
    await renderApp('/settings', options());
    await waitFor(() => expect(inSection().getByText('me@example.com でサインインしています')));
  });

  it('初めてのサインインの処理が終わっていない端末は、起動時にサインアウトする', async () => {
    await db.meta.put({ key: 'syncUid', value: 'someone-else' });
    auth.user = { uid: UID, email: 'me@example.com' };
    await renderApp('/settings', options());
    await waitFor(() =>
      expect(inSection().getByRole('button', { name: 'Google でサインイン' })).toBeEnabled(),
    );
    expect(auth.user).toBeNull();
    expect(await db.meta.get('syncUid')).toBeUndefined();
  });
});

describe('サインイン中のバックアップ', () => {
  it('インポートの確認で、同期しているすべての端末のデータも置き換わることを示す', async () => {
    const { user } = await signInAsFirstDevice();
    expect(
      within(screen.getByRole('region', { name: 'バックアップ' })).getByText(
        /同期している端末にあります/,
      ),
    ).toBeInTheDocument();
    const confirm = vi.mocked(window.confirm);
    confirm.mockClear();
    confirm.mockReturnValue(false);
    const file = new File([JSON.stringify(createBackup(await exportData()))], 'backup.json', {
      type: 'application/json',
    });
    await user.upload(screen.getByLabelText('バックアップファイルを選ぶ'), file);
    await waitFor(() => expect(confirm).toHaveBeenCalled());
    expect(confirm.mock.calls[0][0]).toContain('同期しているすべての端末のデータも');
  });
});
