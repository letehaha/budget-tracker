import { TRANSACTION_TYPES } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import * as helpers from '@tests/helpers';

describe('Add Transactions to Budget', () => {
  const goodResponse = {
    message: 'Transactions added successfully',
  };

  it('successfully adds transactions to a budget', async () => {
    const [baseTx] = await helpers.createTransaction({ raw: true });
    const budget = await helpers.createCustomBudget({
      name: 'Budget With Transactions',
      startDate: '2025-03-01T00:00:00Z',
      endDate: '2025-03-04T23:59:59Z',
      autoInclude: true,
      limitAmount: 500,
      raw: true,
    });

    const data = {
      transactionIds: [baseTx.id],
    };

    expect(baseTx).toBeDefined();

    const response = await helpers.addTransactionToCustomBudget({
      id: budget.id,
      payload: data,
      raw: true,
    });

    expect(response).toEqual(goodResponse);
  });

  it('fails when adding duplicate transaction to the same budget if unique constraint exists', async () => {
    const account = await helpers.createAccount({ raw: true });

    const [transaction] = await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 200,
        transactionType: TRANSACTION_TYPES.expense,
        time: '2025-03-02T12:00:00Z',
        categoryId: 1,
      }),
      raw: true,
    });

    const budget = await helpers.createCustomBudget({
      name: 'Duplicate Test Budget',
      startDate: '2025-03-01T00:00:00Z',
      endDate: '2025-03-31T23:59:59Z',
      autoInclude: false,
      limitAmount: 1000,
      raw: true,
    });

    const data = {
      transactionIds: [transaction.id],
    };

    await helpers.addTransactionToCustomBudget({
      id: budget.id,
      payload: data,
      raw: true,
    });

    const response = await helpers.addTransactionToCustomBudget({
      id: budget.id,
      payload: data,
      raw: false,
    });

    expect(response.body?.status).toBe('error');
  });
});
