import { act } from '@testing-library/react';
import { afterEach } from 'vitest';
import { DESKTOP_QUERY } from '../hooks/useIsDesktop';

type Viewport = 'mobile' | 'desktop';

let current: Viewport = 'desktop';
const listeners = new Set<() => void>();

/** PC 版の判定だけに答える偽の matchMedia */
function fakeMatchMedia(query: string): MediaQueryList {
  return {
    get matches() {
      return query === DESKTOP_QUERY && current === 'desktop';
    },
    media: query,
    onchange: null,
    addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  } as unknown as MediaQueryList;
}

/**
 * 画面幅をスマホ版・PC 版に見立てる。描画後に呼ぶと、ウィンドウ幅を変えたときと同じく再描画させる。
 * テストが終わると matchMedia を消し、既定（PC 版）に戻す
 */
export function mockViewport(viewport: Viewport) {
  current = viewport;
  window.matchMedia = fakeMatchMedia;
  act(() => listeners.forEach((l) => l()));
}

afterEach(() => {
  current = 'desktop';
  listeners.clear();
  delete (window as { matchMedia?: unknown }).matchMedia;
});
