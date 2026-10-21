import { describe, expect, it } from 'vitest';
import { budgetDocId, budgetKeyOf, docIdOf } from './docs';

describe('docId', () => {
  it('予算は categoryId と month から作り、元のキーに戻せる', () => {
    const id = budgetDocId('3f2a-uuid', '2026-10');
    expect(id).toBe('3f2a-uuid__2026-10');
    expect(budgetKeyOf(id)).toEqual(['3f2a-uuid', '2026-10']);
    expect(docIdOf('budgets', { categoryId: '3f2a-uuid', month: '2026-10', amount: null })).toBe(
      id,
    );
  });

  it('予算以外は記録の id をそのまま使う', () => {
    expect(
      docIdOf('categories', {
        id: 'c1',
        kind: 'expense',
        name: '食費',
        hidden: false,
        sortOrder: 0,
      }),
    ).toBe('c1');
  });
});
