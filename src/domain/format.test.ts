import { describe, expect, it } from 'vitest';
import { formatYen } from './format';
import { addMonths, lastDayOfMonth, todayString } from './date';

describe('金額の表示形式', () => {
  it('3桁区切りで表示する', () => {
    expect(formatYen(1234567)).toBe('¥1,234,567');
  });

  it('0 と負の値', () => {
    expect(formatYen(0)).toBe('¥0');
    expect(formatYen(-300)).toBe('-¥300');
  });
});

describe('日付', () => {
  it('今日を端末ローカル日付で返す', () => {
    expect(todayString(new Date(2026, 9, 9, 23, 59))).toBe('2026-10-09');
  });

  it('月の加減算と末日', () => {
    expect(addMonths('2026-10', -1)).toBe('2026-09');
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(lastDayOfMonth('2026-09')).toBe('2026-09-30');
    expect(lastDayOfMonth('2028-02')).toBe('2028-02-29');
  });
});
