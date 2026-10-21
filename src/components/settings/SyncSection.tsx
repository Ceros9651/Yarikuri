import { useEffect, useState } from 'react';
import { UNCONFIGURED_MESSAGE } from '../../sync/config';
import type { SyncError } from '../../sync/remote';
import { useSync } from '../../sync/SyncContext';
import { exportBackupFile, formatDateTime } from './backupFile';

function errorText(error: SyncError): string {
  switch (error.kind) {
    case 'permission-denied':
      return 'クラウドのデータを読み書きする権限がありません。サインアウトしてから、サインインし直してください。';
    case 'quota':
      return 'クラウドの無料枠の1日の上限に達したため、同期できません。翌日になると再開します。';
    default:
      return `同期できませんでした：${error.message}`;
  }
}

/** 初めてサインインした端末で、端末のデータをクラウドの内容で置き換えてよいかの確認 */
function ReplacePrompt({ transactions }: { transactions: number }) {
  const { answerReplace } = useSync();
  const [exported, setExported] = useState<string | null>(null);

  async function handleExport() {
    const name = await exportBackupFile();
    if (name) setExported(name);
  }

  return (
    <div role="group" aria-label="この端末のデータの置き換え">
      <p>
        この Google アカウントには、すでに同期しているデータがあります。この端末のデータ（取引
        {transactions}
        件）は、クラウドの内容で置き換わります。この端末のデータを残したいときは、先にファイルに書き出してください。
      </p>
      {exported && (
        <p className="notice" role="status">
          {exported} を書き出しました
        </p>
      )}
      <div className="form-actions">
        <button type="button" onClick={handleExport}>
          ファイルに書き出す
        </button>
        <button type="button" className="primary" onClick={() => answerReplace(true)}>
          置き換える
        </button>
        <button type="button" onClick={() => answerReplace(false)}>
          キャンセル
        </button>
      </div>
    </div>
  );
}

export function SyncSection() {
  const sync = useSync();
  const { status, configured, prepare } = sync;

  useEffect(() => {
    if (status === 'signedOut' && configured) prepare();
  }, [status, configured, prepare]);

  let body;
  if (sync.status === 'signedOut') {
    body = (
      <>
        <p className="muted">
          同じ Google アカウントでサインインした端末（スマホや
          PC）どうしで、口座・カテゴリ・取引・予算が自動で同期されます。サインインしなければ、データはこの端末の中だけに保存されます。
        </p>
        {!sync.configured && <p className="muted">{UNCONFIGURED_MESSAGE}</p>}
        <div className="form-actions">
          <button
            type="button"
            className="primary"
            disabled={!sync.configured}
            onClick={() => void sync.signIn()}
          >
            Google でサインイン
          </button>
        </div>
      </>
    );
  } else if (sync.status === 'linking') {
    body = sync.replacePrompt ? (
      <ReplacePrompt transactions={sync.replacePrompt.transactions} />
    ) : (
      <p className="muted">サインインしています…</p>
    );
  } else {
    body = (
      <>
        <p>{sync.email} でサインインしています</p>
        <p className="muted" data-testid="last-synced">
          最後に同期した日時：
          {sync.lastSyncedAt ? formatDateTime(sync.lastSyncedAt) : 'まだ同期していません'}
        </p>
        <p className="muted" data-testid="pending">
          {sync.status === 'offline'
            ? sync.pending
              ? 'オフラインのため、送れていない変更は通信が戻ったら送ります'
              : 'オフラインです。通信が戻ったら同期します'
            : sync.status === 'syncing'
              ? '同期しています…'
              : sync.pending
                ? '送れていない変更があります'
                : '送れていない変更はありません'}
        </p>
        {sync.status === 'error' && sync.error && (
          <p className="notice error" role="status">
            {errorText(sync.error)}
          </p>
        )}
        {sync.invalidRecords > 0 && (
          <p className="notice error">
            形式の読めない記録が{sync.invalidRecords}件あったため、この端末には取り込みませんでした
          </p>
        )}
        <div className="form-actions">
          <button type="button" onClick={() => void sync.signOut()}>
            サインアウト
          </button>
        </div>
      </>
    );
  }

  return (
    <section className="card" aria-labelledby="sync-heading">
      <h2 id="sync-heading">同期</h2>
      {body}
      {sync.message && (
        <p className="notice error" role="status">
          {sync.message}
        </p>
      )}
    </section>
  );
}
