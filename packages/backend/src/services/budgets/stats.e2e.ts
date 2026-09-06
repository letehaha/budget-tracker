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
    it('applies refund netting per attached side', async () => {
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
      const [unrefundedTx] = await helpers.createTransaction({
        raw: true,
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 500,
          transactionType: TRANSACTION_TYPES.expense,
        }),
      });

      await helpers.createSingleRefund({ originalTxId: expenseTx.id, refundTxId: refundIncomeTx.id }, true);

      const bothSidesBudget = await helpers.createCustomBudget({
        name: 'refund-net-both-sides',
        limitAmount: 1000,
        raw: true,
      });
      const expenseOnlyBudget = await helpers.createCustomBudget({
        name: 'refund-net-expense-only',
        raw: true,
      });
      const refundOnlyBudget = await helpers.createCustomBudget({
        name: 'refund-net-refund-only',
        raw: true,
      });
      const unrefundedBudget = await helpers.createCustomBudget({
        name: 'refund-net-none',
        raw: true,
      });

      await helpers.addTransactionToCustomBudget({
        id: bothSidesBudget.id,
        payload: { transactionIds: [expenseTx.id, refundIncomeTx.id] },
      });
      await helpers.addTransactionToCustomBudget({
        id: expenseOnlyBudget.id,
        payload: { transactionIds: [expenseTx.id] },
      });
      await helpers.addTransactionToCustomBudget({
        id: refundOnlyBudget.id,
        payload: { transactionIds: [refundIncomeTx.id] },
      });
      await helpers.addTransactionToCustomBudget({
        id: unrefundedBudget.id,
        payload: { transactionIds: [unrefundedTx.id] },
      });

      // Without adjustment: income=200, expense=500, balance=-300.
      // refundTx.refAmount=200 is subtracted from both: income → 0, expense → 300, balance → -300.
      const bothSidesStats = (await helpers.getStats({
        id: bothSidesBudget.id,
        raw: true,
      }))!;
      expect(bothSidesStats.summary.actualIncome).toBe(0);
      expect(bothSidesStats.summary.actualExpense).toBe(300);
      expect(bothSidesStats.summary.balance).toBe(-300);
      expect(bothSidesStats.summary.utilizationRate?.toFixed(2)).toBe(((300 / 1000) * 100).toFixed(2));

      const expenseOnlyStats = (await helpers.getStats({
        id: expenseOnlyBudget.id,
        raw: true,
      }))!;
      expect(expenseOnlyStats.summary.actualIncome).toBe(0);
      expect(expenseOnlyStats.summary.actualExpense).toBe(300);
      expect(expenseOnlyStats.summary.balance).toBe(-300);

      // The refund-income shouldn't count as income. Expense isn't in budget, so unchanged.
      const refundOnlyStats = (await helpers.getStats({
        id: refundOnlyBudget.id,
        raw: true,
      }))!;
      expect(refundOnlyStats.summary.actualIncome).toBe(0);
      expect(refundOnlyStats.summary.actualExpense).toBe(0);
      expect(refundOnlyStats.summary.balance).toBe(0);

      const unrefundedStats = (await helpers.getStats({
        id: unrefundedBudget.id,
        raw: true,
      }))!;
      expect(unrefundedStats.summary.actualIncome).toBe(0);
      expect(unrefundedStats.summary.actualExpense).toBe(500);
      expect(unrefundedStats.summary.balance).toBe(-500);
    }, 60_000);

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
  });
});
