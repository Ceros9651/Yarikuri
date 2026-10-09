const yenFormatter = new Intl.NumberFormat('ja-JP');

/** 1234567 → '¥1,234,567'、-300 → '-¥300' */
export function formatYen(amount: number): string {
  const sign = amount < 0 ? '-' : '';
  return `${sign}¥${yenFormatter.format(Math.abs(amount))}`;
}
