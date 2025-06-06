import { describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import BudgetTransactions from '@models/BudgetTransactions.model';
import * as helpers from '@tests/helpers';

describe('Remove Transactions from Budget', () => {
  it('successfully removes transactions from a budget', async () => {
    // Create a transaction
    const [transaction] = await helpers.createTransaction({ raw: true });

    // Create a budget
    const budget = await helpers.createCustomBudget({
      name: 'Budget For Removal Test',
      startDate: '2025-03-01T00:00:00Z',
      endDate: '2025-03-04T23:59:59Z',
      autoInclude: true,
      limitAmount: 500,
      raw: true,
    });

    // First add the transaction to the budget
    await helpers.addTransactionToCustomBudget({
      id: budget.id,
      payload: { transactionIds: [transaction.id] },
    });

    // Verify the transaction was added
    const beforeRemoval = await BudgetTransactions.findOne({
      where: {
        budgetId: budget.id,
        transactionId: transaction.id,
      },
    });
    expect(beforeRemoval).toBeTruthy();

    // Now remove the transaction
    const response = await helpers.removeTransactionFromCustomBudget({
      id: budget.id,
      payload: { transactionIds: [transaction.id] },
    });

    expect(response.statusCode).toEqual(200);

    // Verify the transaction was removed
    const afterRemoval = await BudgetTransactions.findOne({
      where: {
        budgetId: budget.id,
        transactionId: transaction.id,
      },
    });
    expect(afterRemoval).toBeNull();
  });

  it('fails when trying to remove transactions from a non-existent budget', async () => {
    const [transaction] = await helpers.createTransaction({ raw: true });

    // Use a non-existent budget ID
    const nonExistentBudgetId = 99999;

    const response = await helpers.removeTransactionFromCustomBudget({
      id: nonExistentBudgetId,
      payload: { transactionIds: [transaction.id] },
    });

    expect(response.statusCode).toBe(ERROR_CODES.NotFoundError);
  });

  it('fails when trying to use invalid transaction id param type', async () => {
    const [transaction] = await helpers.createTransaction({ raw: true });

    const budget = await helpers.createCustomBudget({
      name: 'Test',
      startDate: '2025-03-01T00:00:00Z',
      endDate: '2025-03-04T23:59:59Z',
      autoInclude: true,
      limitAmount: 500,
      raw: true,
    });

    await helpers.addTransactionToCustomBudget({
      id: budget.id,
      payload: { transactionIds: [transaction.id] },
    });

    expect(
      (
        await helpers.removeTransactionFromCustomBudget({
          id: budget.id,
          payload: { transactionIds: ['random-id' as unknown as number] },
        })
      ).statusCode,
    ).toBe(ERROR_CODES.ValidationError);

    expect(
      (
        await helpers.removeTransactionFromCustomBudget({
          id: budget.id,
          payload: { transactionIds: 122 as unknown as number[] },
        })
      ).statusCode,
    ).toBe(ERROR_CODES.ValidationError);
  });

  it('does not error when removing a transaction that is not in the budget', async () => {
    const [transaction] = await helpers.createTransaction({ raw: true });

    // Create a budget (without adding the transaction)
    const budget = await helpers.createCustomBudget({
      name: 'Budget For Non-Existent Transaction Test',
      startDate: '2025-03-01T00:00:00Z',
      endDate: '2025-03-04T23:59:59Z',
      autoInclude: false,
      limitAmount: 500,
      raw: true,
    });

    // Try to remove a transaction that was never added
    const response = await helpers.removeTransactionFromCustomBudget({
      id: budget.id,
      payload: { transactionIds: [transaction.id] },
    });

    expect(response.statusCode).toEqual(200);
  });
});
