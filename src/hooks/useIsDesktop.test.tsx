import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { mockViewport } from '../test/viewport';
import { useIsDesktop } from './useIsDesktop';

function Probe() {
  return <p>{useIsDesktop() ? 'PC' : 'スマホ'}</p>;
}

describe('useIsDesktop', () => {
  it('matchMedia がなければ PC 版として扱う', () => {
    render(<Probe />);
    expect(screen.getByText('PC')).toBeInTheDocument();
  });

  it('1024px 未満ならスマホ版になる', () => {
    mockViewport('mobile');
    render(<Probe />);
    expect(screen.getByText('スマホ')).toBeInTheDocument();
  });

  it('幅が境界をまたぐと再描画される', () => {
    mockViewport('desktop');
    render(<Probe />);
    expect(screen.getByText('PC')).toBeInTheDocument();
    mockViewport('mobile');
    expect(screen.getByText('スマホ')).toBeInTheDocument();
    mockViewport('desktop');
    expect(screen.getByText('PC')).toBeInTheDocument();
  });
});
