import { TRANSACTION_TYPES } from '@bt/shared/types';
import { beforeAll, describe, expect, it } from '@jest/globals';
import * as helpers from '@tests/helpers';

describe('Create Budget', () => {
  const budgetName = 'Test Budget';
  let userId: number;

  beforeAll(async () => {
    userId = 1;
  });

  it('successfully creates a budget', async () => {
    const budget = await helpers.createCustomBudget({
      name: budgetName,
      userId,
      startDate: '2025-03-01T00:00:00Z',
      endDate: '2025-03-31T23:59:59Z',
      autoInclude: false,
      limitAmount: 1000,
      raw: true,
    });

    const response = await helpers.getCustomBudgets({ raw: true });
    expect(response.length).toBeGreaterThanOrEqual(1);
    expect(!!response.find((i) => i.name === budgetName)).toBe(true);

    const budgetById = await helpers.getCustomBudgetById({ id: budget.id, raw: true });
    expect(budgetById?.name).toBe(budgetName);
  });

  it('can create budgets with the same name', async () => {
    await helpers.createCustomBudget({
      name: budgetName,
      userId,
      startDate: '2025-03-01T00:00:00Z',
      endDate: '2025-03-31T23:59:59Z',
      raw: true,
    });

    await helpers.createCustomBudget({
      name: budgetName,
      userId,
      startDate: '2025-04-01T00:00:00Z',
      endDate: '2025-04-30T23:59:59Z',
      raw: true,
    });

    const response = await helpers.getCustomBudgets({ raw: true });
    expect(response.length).toBeGreaterThanOrEqual(2);
    expect(response.filter((i) => i.name === budgetName).length).toBeGreaterThanOrEqual(2);
  });

  it('successfully creates a budget with transactions when autoInclude is true', async () => {
    const account = await helpers.createAccount({ raw: true });

    await Promise.all([
      helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 100,
          transactionType: TRANSACTION_TYPES.expense,
          time: '2025-03-02T10:00:00Z',
          categoryId: 1,
        }),
        raw: true,
      }),
      helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 200,
          transactionType: TRANSACTION_TYPES.expense,
          time: '2025-03-03T10:00:00Z',
          categoryId: 1,
        }),
        raw: true,
      }),
    ]);

    const budget = await helpers.createCustomBudget({
      name: 'Budget With Transactions',
      userId,
      startDate: '2025-03-01T00:00:00Z',
      endDate: '2025-03-04T23:59:59Z',
      autoInclude: true,
      limitAmount: 500,
      raw: true,
    });

    const response = await helpers.getCustomBudgets({ raw: true });
    expect(response.length).toBeGreaterThanOrEqual(1);
    expect(!!response.find((i) => i.name === 'Budget With Transactions')).toBe(true);

    const budgetById = await helpers.getCustomBudgetById({ id: budget.id, raw: true });
    expect(budgetById?.name).toBe('Budget With Transactions');
  });
});
