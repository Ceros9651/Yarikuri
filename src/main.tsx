import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// ブラウザが容量不足などでデータを自動削除しにくくする
navigator.storage
  ?.persist?.()
  .catch((e: unknown) => console.warn('ストレージの永続化を要求できませんでした', e));

// 新しい版を公開すると古い版の分割ファイル（Firebase など）は消えるため、古い版の画面のままだと
// 読み込みに失敗する。そのときは新しい版で開き直す。開き直しても失敗するときに繰り返さないよう、1分に1回まで
const RELOADED_AT_KEY = 'yarikuri:reloaded-for-update';
window.addEventListener('vite:preloadError', (event) => {
  try {
    const last = Number(sessionStorage.getItem(RELOADED_AT_KEY) ?? 0);
    if (Date.now() - last < 60_000) return;
    sessionStorage.setItem(RELOADED_AT_KEY, String(Date.now()));
  } catch {
    // sessionStorage が使えなければ開き直さない（繰り返しを防げないため）
    return;
  }
  event.preventDefault();
  window.location.reload();
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
