import { exportData, setLastExportedAt } from '../../db/backup';
import { backupFileName, createBackup } from '../../domain/backup';

export function formatDateTime(iso: string): string {
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

/** 端末の全データをバックアップファイルに書き出す。保存したらファイル名、やめたら null */
export async function exportBackupFile(): Promise<string | null> {
  const now = new Date();
  const backup = createBackup(await exportData(), now);
  const file = new File([JSON.stringify(backup, null, 2)], backupFileName(now), {
    type: 'application/json',
  });
  if (!(await saveFile(file))) return null;
  await setLastExportedAt(now);
  return file.name;
}
