import { describe, expect, it } from 'vitest';
import { formatPeriodLabel, isInPeriod, periodOf, periodRange } from './date';

describe('月の範囲', () => {
  it('開始日が 1日なら暦月', () => {
    expect(periodRange('2026-02', 1)).toEqual({ start: '2026-02-01', end: '2026-02-28' });
    expect(periodRange('2026-10', 1)).toEqual({ start: '2026-10-01', end: '2026-10-31' });
  });

  it('開始日が 6日なら翌月 5日まで', () => {
    expect(periodRange('2026-10', 6)).toEqual({ start: '2026-10-06', end: '2026-11-05' });
  });

  it('年をまたぐ', () => {
    expect(periodRange('2026-12', 6)).toEqual({ start: '2026-12-06', end: '2027-01-05' });
  });

  it('開始日が 28日なら 2月の短い月にも収まる', () => {
    expect(periodRange('2027-01', 28)).toEqual({ start: '2027-01-28', end: '2027-02-27' });
    expect(periodRange('2027-02', 28)).toEqual({ start: '2027-02-28', end: '2027-03-27' });
  });

  it('範囲に含まれるかを両端を含めて判定する', () => {
    const range = periodRange('2026-10', 6);
    expect(isInPeriod('2026-10-05', range)).toBe(false);
    expect(isInPeriod('2026-10-06', range)).toBe(true);
    expect(isInPeriod('2026-11-05', range)).toBe(true);
    expect(isInPeriod('2026-11-06', range)).toBe(false);
  });
});

describe('日付が属する月', () => {
  it('開始日より前の日は前の月になる', () => {
    expect(periodOf('2026-11-03', 6)).toBe('2026-10');
    expect(periodOf('2026-11-05', 6)).toBe('2026-10');
    expect(periodOf('2026-11-06', 6)).toBe('2026-11');
    expect(periodOf('2027-01-05', 6)).toBe('2026-12');
  });

  it('開始日が 1日なら暦月', () => {
    expect(periodOf('2026-11-01', 1)).toBe('2026-11');
    expect(periodOf(new Date(2026, 10, 30), 1)).toBe('2026-11');
  });

  it('Date も受け取る', () => {
    expect(periodOf(new Date(2026, 10, 3), 6)).toBe('2026-10');
  });
});

describe('期間のラベル', () => {
  it('開始日と終了日を月日で示す', () => {
    expect(formatPeriodLabel(periodRange('2026-10', 6))).toBe('10月6日〜11月5日');
    expect(formatPeriodLabel(periodRange('2026-12', 6))).toBe('12月6日〜1月5日');
  });
});
