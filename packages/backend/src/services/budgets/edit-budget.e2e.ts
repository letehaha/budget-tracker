// tests/e2e/edit-budgets.e2e.ts
import { describe, expect, it, beforeAll } from '@jest/globals';
import * as helpers from '@tests/helpers';
import { Response } from 'superagent';

describe('Edit Budget', () => {
  let userId: number;

  beforeAll(async () => {
    userId = 1;
  });

  it('successfully edits a budget name', async () => {
    const budget = await helpers.createCustomBudget({
      name: 'Original Budget',
      userId,
      startDate: '2025-03-01T00:00:00Z',
      endDate: '2025-03-31T23:59:59Z',
      autoInclude: false,
      limitAmount: 1000,
      raw: true,
    });

    const newName = 'Updated Budget';
    const params = { name: newName };
    const editedBudget = await helpers.editCustomBudget({
      id: budget.id,
      raw: true,
      params,
    });

    expect(editedBudget).toEqual({ status: 'success' });

    const budgetById = await helpers.getCustomBudgetById({ id: budget.id, raw: true });
    expect(budgetById?.name).toBe(newName);
  });

  it('returns error when budget is not found', async () => {
    const params = { name: 'Some name' };
    const response = await helpers.editCustomBudget({
      id: 999999,
      params,
      raw: false,
    }) as Response;

    expect(response.body?.status).toBe('error');
    expect(response.body?.response.message).toBe('Unexpected error.');
  });

  it('does not change budget if name is not provided', async () => {
    const originalName = 'No Change Budget';
    const budget = await helpers.createCustomBudget({
      name: originalName,
      userId,
      startDate: '2025-04-01T00:00:00Z',
      endDate: '2025-04-30T23:59:59Z',
      autoInclude: false,
      limitAmount: 2000,
      raw: true,
    });

    const params = {};
    const editedBudget = await helpers.editCustomBudget({
      id: budget.id,
      raw: true,
      params,
    });


    expect(editedBudget).toEqual({ status: 'success' });

    const budgetById = await helpers.getCustomBudgetById({ id: budget.id, raw: true });
    expect(budgetById?.name).toBe(originalName);
  });
});
