import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// ブラウザが容量不足などでデータを自動削除しにくくする
navigator.storage
  ?.persist?.()
  .catch((e: unknown) => console.warn('ストレージの永続化を要求できませんでした', e));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
