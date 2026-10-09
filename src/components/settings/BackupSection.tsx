import { useRef, useState, type ChangeEvent } from 'react';
import { exportData, importData, setLastExportedAt } from '../../db/backup';
import { backupFileName, createBackup, parseBackup } from '../../domain/backup';
import { useLastExportedAt } from '../../hooks/useData';

type Notice = { kind: 'info' | 'error'; text: string } | null;

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** 共有シート（iOS では「ファイルに保存」）が使えればそれで、だめならダウンロードで保存する */
async function saveFile(file: File): Promise<boolean> {
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: file.name });
      return true;
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return false;
      // 共有に失敗した場合はダウンロードに切り替える
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

export function BackupSection() {
  const lastExportedAt = useLastExportedAt();
  const [notice, setNotice] = useState<Notice>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  async function handleExport() {
    const now = new Date();
    const backup = createBackup(await exportData(), now);
    const file = new File([JSON.stringify(backup, null, 2)], backupFileName(now), {
      type: 'application/json',
    });
    if (await saveFile(file)) {
      await setLastExportedAt(now);
      setNotice({ kind: 'info', text: `${file.name} を書き出しました` });
    }
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
    const { accounts, categories, transactions } = result.data;
    const ok = window.confirm(
      `今のデータをすべて削除し、バックアップの内容（口座${accounts.length}件・カテゴリ${categories.length}件・取引${transactions.length}件）で置き換えます。よろしいですか？`,
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
        データはこの端末の中にだけ保存されています。機種変更やデータ消失に備えて、定期的に書き出してください。
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
