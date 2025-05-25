import { TRANSACTION_TYPES } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import * as helpers from '@tests/helpers';

describe('Delete Budget', () => {
  it('successfully deletes a budget without transactions', async () => {
    const budget = await helpers.createCustomBudget({
      name: 'Test Budget',
      startDate: '2025-03-01T00:00:00Z',
      endDate: '2025-03-31T23:59:59Z',
      autoInclude: false,
      limitAmount: 1000,
      raw: true,
    });

    const deleteResponse = await helpers.deleteCustomBudget({
      id: budget.id,
      raw: true,
    });
    expect(deleteResponse.success).toBe(true);

    const budgetById = await helpers.getCustomBudgetById({ id: budget.id, raw: true });
    expect(budgetById).toBeNull();

    const budgets = await helpers.getCustomBudgets({ raw: true });
    expect(budgets.find((b) => b.id === budget.id)).toBeUndefined();
  });

  it('successfully deletes a budget with transactions when autoInclude is true', async () => {
    const account = await helpers.createAccount({ raw: true });

    const transactions = await Promise.all([
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
      startDate: '2025-03-01T00:00:00Z',
      endDate: '2025-03-04T23:59:59Z',
      autoInclude: true,
      limitAmount: 500,
      raw: true,
    });

    const budgetTransactionsBefore = await helpers.getTransactions({
      budgetIds: [budget.id],
      limit: 30,
      raw: true,
    });
    expect(budgetTransactionsBefore.length).toBe(2);
    const transactionIds = budgetTransactionsBefore.map((t) => t.id);
    expect(transactionIds).toContain(transactions[0][0].id);
    expect(transactionIds).toContain(transactions[1][0].id);

    const deleteResponse = await helpers.deleteCustomBudget({
      id: budget.id,
      raw: true,
    });
    expect(deleteResponse.success).toBe(true);

    const budgetById = await helpers.getCustomBudgetById({ id: budget.id, raw: true });
    expect(budgetById).toBeNull();

    const budgetTransactionsAfter = await helpers.getTransactions({
      budgetIds: [budget.id],
      limit: 30,
      raw: true,
    });
    expect(budgetTransactionsAfter.length).toBe(0);
  });

  it('fails to delete a non-existent budget', async () => {
    const deleteResponse = await helpers.deleteCustomBudget({
      id: 999999,
      raw: false,
    });

    expect(deleteResponse.statusCode).toBe(200);
  });
});
