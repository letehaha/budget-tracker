import { describe, expect, it } from 'vitest';

import { buildBudgetEditPayload } from './build-budget-edit-payload';

describe('buildBudgetEditPayload', () => {
  const baseValues = { name: 'Groceries', categoryIds: ['cat-1', 'cat-2'] };

  it('omits limitAmount when it is null', () => {
    const payload = buildBudgetEditPayload({ ...baseValues, limitAmount: null });

    expect(payload).toEqual({ name: 'Groceries', categoryIds: ['cat-1', 'cat-2'] });
    expect('limitAmount' in payload).toBe(false);
  });

  it('omits limitAmount when it is undefined', () => {
    const payload = buildBudgetEditPayload({ ...baseValues, limitAmount: undefined });

    expect('limitAmount' in payload).toBe(false);
  });

  it('omits limitAmount when it is 0', () => {
    const payload = buildBudgetEditPayload({ ...baseValues, limitAmount: 0 });

    expect('limitAmount' in payload).toBe(false);
  });

  it('omits limitAmount when it is negative', () => {
    const payload = buildBudgetEditPayload({ ...baseValues, limitAmount: -50 });

    expect('limitAmount' in payload).toBe(false);
  });

  it('includes limitAmount when it is a positive number', () => {
    const payload = buildBudgetEditPayload({ ...baseValues, limitAmount: 250 });

    expect(payload).toEqual({ name: 'Groceries', categoryIds: ['cat-1', 'cat-2'], limitAmount: 250 });
  });
});
