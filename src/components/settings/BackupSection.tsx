import { useRef, useState, type ChangeEvent } from 'react';
import { importData } from '../../db/backup';
import { parseBackup } from '../../domain/backup';
import { useLastExportedAt } from '../../hooks/useData';
import { useSync } from '../../sync/SyncContext';
import { exportBackupFile, formatDateTime } from './backupFile';

type Notice = { kind: 'info' | 'error'; text: string } | null;

export function BackupSection() {
  const lastExportedAt = useLastExportedAt();
  const { status } = useSync();
  const syncing = status !== 'signedOut' && status !== 'linking';
  const [notice, setNotice] = useState<Notice>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  async function handleExport() {
    const name = await exportBackupFile();
    if (name) setNotice({ kind: 'info', text: `${name} を書き出しました` });
  }

  async function handleImport(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const result = parseBackup(await file.text());
    if (!result.ok) {
      setNotice({ kind: 'error', text: `読み込めませんでした：${result.error}` });
      return;
    }
    const { accounts, categories, transactions, budgets } = result.data;
    const ok = window.confirm(
      `今のデータをすべて削除し、バックアップの内容（口座${accounts.length}件・カテゴリ${categories.length}件・取引${transactions.length}件・予算${budgets.length}件）で置き換えます。` +
        (syncing ? '同期しているすべての端末のデータも、この内容に置き換わります。' : '') +
        'よろしいですか？',
    );
    if (!ok) {
      setNotice(null);
      return;
    }
    await importData(result.data);
    setNotice({ kind: 'info', text: 'バックアップから復元しました' });
  }

  return (
    <section className="card" aria-labelledby="backup-heading">
      <h2 id="backup-heading">バックアップ</h2>
      <p className="muted">
        {syncing
          ? 'データはこの端末と、同期している端末にあります。誤って消したときに戻せるよう、ときどき書き出してください。'
          : 'データはこの端末の中にだけ保存されています。機種変更やデータ消失に備えて、定期的に書き出してください。'}
      </p>
      <p className="muted" data-testid="last-exported">
        最終エクスポート：
        {lastExportedAt ? formatDateTime(lastExportedAt) : 'まだ書き出していません'}
      </p>
      {notice && (
        <p className={`notice ${notice.kind === 'error' ? 'error' : ''}`} role="status">
          {notice.text}
        </p>
      )}
      <div className="form-actions">
        <button type="button" className="primary" onClick={handleExport}>
          エクスポート
        </button>
        <button type="button" onClick={() => fileInput.current?.click()}>
          インポート
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          aria-label="バックアップファイルを選ぶ"
          hidden
          onChange={handleImport}
        />
      </div>
    </section>
  );
}
