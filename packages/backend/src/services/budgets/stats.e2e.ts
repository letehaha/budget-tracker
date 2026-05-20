import { BUDGET_TYPES, TRANSACTION_TYPES } from '@bt/shared/types';
import { NONEXISTENT_ID } from '@common/lib/record-id-helpers';
import { describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import * as helpers from '@tests/helpers';

import { getResponseInitialState } from './stats';

describe('Get budget stats', () => {
  it('successfully returns stats', async () => {
    const [baseTx] = await helpers.createTransaction({ raw: true });
    const [base2Tx] = await helpers.createTransaction({ raw: true });

    // Budget *without* limitAmount
    const budget_1 = await helpers.createCustomBudget({
      name: 'test-1',
      startDate: '2025-03-01T00:00:00Z',
      endDate: '2025-03-04T23:59:59Z',
      raw: true,
    });

    // Budget *with* limitAmount
    const budget_2 = await helpers.createCustomBudget({
      name: 'test-2',
      startDate: '2025-03-01T00:00:00Z',
      endDate: '2025-03-04T23:59:59Z',
      limitAmount: 1500,
      raw: true,
    });

    // Empty budget
    const budget_3 = await helpers.createCustomBudget({
      name: 'test-3',
      startDate: '2025-03-01T00:00:00Z',
      endDate: '2025-03-04T23:59:59Z',
      raw: true,
    });

    const data = {
      transactionIds: [baseTx.id, base2Tx.id],
    };

    await helpers.addTransactionToCustomBudget({
      id: budget_1.id,
      payload: data,
    });
    await helpers.addTransactionToCustomBudget({
      id: budget_2.id,
      payload: data,
    });

    const budget_1_result = (await helpers.getStats({ id: budget_1.id, raw: true }))!;
    const budget_2_result = (await helpers.getStats({ id: budget_2.id, raw: true }))!;
    const budget_3_result = (await helpers.getStats({ id: budget_3.id, raw: true }))!;

    expect(budget_1_result.summary.actualExpense).toBe(2000);
    expect(budget_2_result.summary.actualExpense).toBe(2000);

    expect(budget_1_result.summary.actualIncome).toBe(0);
    expect(budget_2_result.summary.actualIncome).toBe(0);

    expect(budget_1_result.summary.balance).toBe(-2000);

    expect(budget_1_result.summary.utilizationRate).toBe(null);
    expect(budget_2_result.summary.utilizationRate?.toFixed(2)).toBe(((2000 / 1500) * 100).toFixed(2));

    expect(budget_3_result).toEqual(getResponseInitialState());
  });

  it('fails when invalid param provided', async () => {
    expect((await helpers.getStats({ id: 'foo' as unknown as string, raw: false })).statusCode).toBe(
      ERROR_CODES.ValidationError,
    );

    expect((await helpers.getStats({ id: NONEXISTENT_ID, raw: false })).statusCode).toBe(ERROR_CODES.NotFoundError);
  });

  describe('Refund handling', () => {
    it('nets out a refund-income (expense refunded by income) when both sides are in the budget', async () => {
      const account = await helpers.createAccount({ raw: true });

      const [expenseTx] = await helpers.createTransaction({
        raw: true,
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 500,
          transactionType: TRANSACTION_TYPES.expense,
        }),
      });
      const [refundIncomeTx] = await helpers.createTransaction({
        raw: true,
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 200,
          transactionType: TRANSACTION_TYPES.income,
        }),
      });

      await helpers.createSingleRefund({ originalTxId: expenseTx.id, refundTxId: refundIncomeTx.id }, true);

      const budget = await helpers.createCustomBudget({
        name: 'refund-net-test-1',
        limitAmount: 1000,
        raw: true,
      });
      await helpers.addTransactionToCustomBudget({
        id: budget.id,
        payload: { transactionIds: [expenseTx.id, refundIncomeTx.id] },
      });

      const stats = (await helpers.getStats({ id: budget.id, raw: true }))!;

      // Without adjustment: income=200, expense=500, balance=-300.
      // refundTx.refAmount=200 is subtracted from both: income → 0, expense → 300, balance → -300.
      expect(stats.summary.actualIncome).toBe(0);
      expect(stats.summary.actualExpense).toBe(300);
      expect(stats.summary.balance).toBe(-300);
      expect(stats.summary.utilizationRate?.toFixed(2)).toBe(((300 / 1000) * 100).toFixed(2));
    });

    it('nets out a refund-expense (income refunded by expense) when both sides are in the budget', async () => {
      const account = await helpers.createAccount({ raw: true });

      const [incomeTx] = await helpers.createTransaction({
        raw: true,
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 300,
          transactionType: TRANSACTION_TYPES.income,
        }),
      });
      const [refundExpenseTx] = await helpers.createTransaction({
        raw: true,
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 100,
          transactionType: TRANSACTION_TYPES.expense,
        }),
      });

      await helpers.createSingleRefund({ originalTxId: incomeTx.id, refundTxId: refundExpenseTx.id }, true);

      const budget = await helpers.createCustomBudget({
        name: 'refund-net-test-2',
        raw: true,
      });
      await helpers.addTransactionToCustomBudget({
        id: budget.id,
        payload: { transactionIds: [incomeTx.id, refundExpenseTx.id] },
      });

      const stats = (await helpers.getStats({ id: budget.id, raw: true }))!;

      // Without: income=300, expense=100, balance=200.
      // refundTx.refAmount=100 subtracted from both: income → 200, expense → 0, balance → 200.
      expect(stats.summary.actualIncome).toBe(200);
      expect(stats.summary.actualExpense).toBe(0);
      expect(stats.summary.balance).toBe(200);
    });

    it('reduces only the expense side when only the original expense is in the budget', async () => {
      const account = await helpers.createAccount({ raw: true });

      const [expenseTx] = await helpers.createTransaction({
        raw: true,
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 500,
          transactionType: TRANSACTION_TYPES.expense,
        }),
      });
      const [refundIncomeTx] = await helpers.createTransaction({
        raw: true,
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 200,
          transactionType: TRANSACTION_TYPES.income,
        }),
      });

      await helpers.createSingleRefund({ originalTxId: expenseTx.id, refundTxId: refundIncomeTx.id }, true);

      const budget = await helpers.createCustomBudget({
        name: 'refund-net-test-3',
        raw: true,
      });
      // Only the expense side is linked to the budget.
      await helpers.addTransactionToCustomBudget({
        id: budget.id,
        payload: { transactionIds: [expenseTx.id] },
      });

      const stats = (await helpers.getStats({ id: budget.id, raw: true }))!;

      expect(stats.summary.actualIncome).toBe(0);
      expect(stats.summary.actualExpense).toBe(300);
      expect(stats.summary.balance).toBe(-300);
    });

    it('drops the refund-income from actualIncome when only the refund side is in the budget', async () => {
      const account = await helpers.createAccount({ raw: true });

      const [expenseTx] = await helpers.createTransaction({
        raw: true,
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 500,
          transactionType: TRANSACTION_TYPES.expense,
        }),
      });
      const [refundIncomeTx] = await helpers.createTransaction({
        raw: true,
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 200,
          transactionType: TRANSACTION_TYPES.income,
        }),
      });

      await helpers.createSingleRefund({ originalTxId: expenseTx.id, refundTxId: refundIncomeTx.id }, true);

      const budget = await helpers.createCustomBudget({
        name: 'refund-net-test-4',
        raw: true,
      });
      // Only the refund-income side is linked to the budget.
      await helpers.addTransactionToCustomBudget({
        id: budget.id,
        payload: { transactionIds: [refundIncomeTx.id] },
      });

      const stats = (await helpers.getStats({ id: budget.id, raw: true }))!;

      // The refund-income shouldn't count as income. Expense isn't in budget, so unchanged.
      expect(stats.summary.actualIncome).toBe(0);
      expect(stats.summary.actualExpense).toBe(0);
      expect(stats.summary.balance).toBe(0);
    });

    it('nets out a refund for a category budget', async () => {
      const account = await helpers.createAccount({ raw: true });
      const category = await helpers.addCustomCategory({
        name: 'Groceries',
        color: '#AABBCC',
        raw: true,
      });

      const [expenseTx] = await helpers.createTransaction({
        raw: true,
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 500,
          categoryId: category.id,
          transactionType: TRANSACTION_TYPES.expense,
          time: '2025-06-10T10:00:00Z',
        }),
      });
      const [refundIncomeTx] = await helpers.createTransaction({
        raw: true,
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 200,
          categoryId: category.id,
          transactionType: TRANSACTION_TYPES.income,
          time: '2025-06-15T10:00:00Z',
        }),
      });

      await helpers.createSingleRefund({ originalTxId: expenseTx.id, refundTxId: refundIncomeTx.id }, true);

      const budget = await helpers.createCustomBudget({
        name: 'refund-category-budget-stats',
        type: BUDGET_TYPES.category,
        categoryIds: [category.id],
        startDate: '2025-06-01T00:00:00Z',
        endDate: '2025-06-30T23:59:59Z',
        limitAmount: 1000,
        raw: true,
      });

      const stats = (await helpers.getStats({ id: budget.id, raw: true }))!;

      // Without adjustment: income=200, expense=500, balance=-300. refundTx.refAmount=200 is
      // subtracted from both sides: income → 0, expense → 300, balance → -300.
      expect(stats.summary.actualIncome).toBe(0);
      expect(stats.summary.actualExpense).toBe(300);
      expect(stats.summary.balance).toBe(-300);
      expect(stats.summary.utilizationRate?.toFixed(2)).toBe(((300 / 1000) * 100).toFixed(2));
    });

    it('does nothing when no in-budget transactions are refund-linked', async () => {
      const account = await helpers.createAccount({ raw: true });

      const [expenseTx] = await helpers.createTransaction({
        raw: true,
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 500,
          transactionType: TRANSACTION_TYPES.expense,
        }),
      });

      const budget = await helpers.createCustomBudget({
        name: 'no-refund-test',
        raw: true,
      });
      await helpers.addTransactionToCustomBudget({
        id: budget.id,
        payload: { transactionIds: [expenseTx.id] },
      });

      const stats = (await helpers.getStats({ id: budget.id, raw: true }))!;

      expect(stats.summary.actualIncome).toBe(0);
      expect(stats.summary.actualExpense).toBe(500);
      expect(stats.summary.balance).toBe(-500);
    });
  });
});
