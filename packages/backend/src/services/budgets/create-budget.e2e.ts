import { TRANSACTION_TYPES } from '@bt/shared/types';
import { NONEXISTENT_ID } from '@common/lib/record-id-helpers';
import { describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import * as helpers from '@tests/helpers';

describe('Create Budget', () => {
  const budgetName = 'Test Budget';

  it('successfully creates a budget', async () => {
    const budget = await helpers.createCustomBudget({
      name: budgetName,
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
      startDate: '2025-03-01T00:00:00Z',
      endDate: '2025-03-31T23:59:59Z',
      raw: true,
    });

    await helpers.createCustomBudget({
      name: budgetName,
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
          categoryId: NONEXISTENT_ID,
        }),
        raw: true,
      }),
      helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 200,
          transactionType: TRANSACTION_TYPES.expense,
          time: '2025-03-03T10:00:00Z',
          categoryId: NONEXISTENT_ID,
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

    const response = await helpers.getCustomBudgets({ raw: true });
    expect(response.length).toBeGreaterThanOrEqual(1);
    expect(!!response.find((i) => i.name === 'Budget With Transactions')).toBe(true);

    const budgetById = await helpers.getCustomBudgetById({ id: budget.id, raw: true });
    expect(budgetById?.name).toBe('Budget With Transactions');
  });

  describe('autoInclude with planned transactions', () => {
    const seedRangeWithPlannedTransaction = async () => {
      const account = await helpers.createAccount({ raw: true });

      const [realTx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 100,
          transactionType: TRANSACTION_TYPES.expense,
          time: '2025-03-02T10:00:00Z',
        }),
        raw: true,
      });

      const [plannedTx] = await helpers.createPlannedTransaction({
        payload: {
          accountId: account.id,
          amount: 250,
          transactionType: TRANSACTION_TYPES.expense,
          time: '2025-03-03T10:00:00Z',
        },
        raw: true,
      });

      const budget = await helpers.createCustomBudget({
        name: 'Auto-include Planned Budget',
        startDate: '2025-03-01T00:00:00Z',
        endDate: '2025-03-04T23:59:59Z',
        autoInclude: true,
        limitAmount: 500,
        raw: true,
      });

      return { account, realTx, plannedTx, budget };
    };

    it('links only the real transaction from the covered date range', async () => {
      const { realTx, plannedTx, budget } = await seedRangeWithPlannedTransaction();

      const linked = await helpers.getTransactions({ budgetIds: [budget.id], limit: 30, raw: true });
      const linkedIds = linked.map((tx) => tx.id);

      expect(linkedIds).toEqual([realTx.id]);
      expect(linkedIds).not.toContain(plannedTx.id);
    });

    it('does not count the planned transaction in budget stats', async () => {
      const { budget } = await seedRangeWithPlannedTransaction();

      const stats = (await helpers.getStats({ id: budget.id, raw: true }))!;

      expect(stats.summary.actualExpense).toBe(100);
      expect(stats.summary.actualIncome).toBe(0);
      expect(stats.summary.balance).toBe(-100);
      expect(stats.summary.transactionsCount).toBe(1);
      expect(stats.summary.utilizationRate).toBeCloseTo((100 / 500) * 100, 1);
    });
  });

  it('fails validation when start date is later than end date', async () => {
    const response = await helpers.createCustomBudget({
      name: 'Inverted Range Budget',
      startDate: '2025-03-31T23:59:59Z',
      endDate: '2025-03-01T00:00:00Z',
      raw: false,
    });

    expect(response.statusCode).toEqual(ERROR_CODES.ValidationError);
  });
});
