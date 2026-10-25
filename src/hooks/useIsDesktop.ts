import { useSyncExternalStore } from 'react';

/** PC 版とみなす画面幅。index.css の `@media (min-width: 1024px)` とそろえる */
export const DESKTOP_QUERY = '(min-width: 1024px)';

function subscribe(onChange: () => void) {
  if (typeof window.matchMedia !== 'function') return () => {};
  const mql = window.matchMedia(DESKTOP_QUERY);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}

function getSnapshot(): boolean {
  // matchMedia のない環境（テストの jsdom）では PC 版として扱う
  if (typeof window.matchMedia !== 'function') return true;
  return window.matchMedia(DESKTOP_QUERY).matches;
}

/** 画面幅が PC 版（1024px 以上）かどうか。幅が境界をまたいで変わると再描画する */
export function useIsDesktop(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot);
}
