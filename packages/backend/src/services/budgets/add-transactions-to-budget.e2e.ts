import { TRANSACTION_TYPES, asDecimal } from '@bt/shared/types';
import { generateRandomRecordId } from '@common/lib/record-id-helpers';
import { describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import * as helpers from '@tests/helpers';

describe('Add Transactions to Budget', () => {
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
      raw: false,
    });

    expect(response.statusCode).toEqual(200);
  });

  it('fails when adding duplicate transaction to the same budget if unique constraint exists', async () => {
    const account = await helpers.createAccount({ raw: true });

    const [transaction] = await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 200,
        transactionType: TRANSACTION_TYPES.expense,
        time: '2025-03-02T12:00:00Z',
        categoryId: global.DEFAULT_CATEGORY_ID,
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

  describe('balance adjustments', () => {
    it('attaches a balance-adjustment row in the same batch as a normal transaction', async () => {
      const account = await helpers.createAccount({
        payload: helpers.buildAccountPayload({ initialBalance: 1000 }),
        raw: true,
      });

      const [normalTx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 100,
          transactionType: TRANSACTION_TYPES.expense,
          time: '2025-03-02T12:00:00Z',
        }),
        raw: true,
      });

      const adjustment = await helpers.balanceAdjustment({
        id: account.id,
        payload: { targetBalance: asDecimal(500) },
        raw: true,
      });
      const adjustmentTx = adjustment.transaction!;

      const budget = await helpers.createCustomBudget({
        name: 'Balance Adjustment Budget',
        startDate: '2025-03-01T00:00:00Z',
        endDate: '2025-03-31T23:59:59Z',
        autoInclude: false,
        limitAmount: 1000,
        raw: true,
      });

      const response = await helpers.addTransactionToCustomBudget({
        id: budget.id,
        payload: { transactionIds: [normalTx.id, adjustmentTx.id] },
        raw: false,
      });

      expect(response.statusCode).toEqual(200);

      const linked = await helpers.getTransactions({ budgetIds: [budget.id], limit: 30, raw: true });
      expect(linked.map((tx) => tx.id).toSorted()).toEqual([normalTx.id, adjustmentTx.id].toSorted());
    });
  });

  describe('planned transactions', () => {
    const seedBudgetWithPlannedTransaction = async () => {
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
        name: 'Planned Attach Budget',
        startDate: '2025-03-01T00:00:00Z',
        endDate: '2025-03-31T23:59:59Z',
        autoInclude: false,
        limitAmount: 500,
        raw: true,
      });

      return { account, realTx, plannedTx, budget };
    };

    it('attaches an owner-selected planned transaction alongside real ones', async () => {
      const { realTx, plannedTx, budget } = await seedBudgetWithPlannedTransaction();

      const response = await helpers.addTransactionToCustomBudget({
        id: budget.id,
        payload: { transactionIds: [realTx.id, plannedTx.id] },
        raw: false,
      });

      expect(response.statusCode).toEqual(200);

      const linked = await helpers.getTransactions({ budgetIds: [budget.id], limit: 30, raw: true });
      expect(linked.map((tx) => tx.id).toSorted()).toEqual([realTx.id, plannedTx.id].toSorted());
    });

    it("counts an attached plan in the owner's budget stats", async () => {
      const { realTx, plannedTx, budget } = await seedBudgetWithPlannedTransaction();

      await helpers.addTransactionToCustomBudget({
        id: budget.id,
        payload: { transactionIds: [realTx.id, plannedTx.id] },
        raw: false,
      });

      const stats = (await helpers.getStats({ id: budget.id, raw: true }))!;
      expect(stats.summary.transactionsCount).toBe(2);
      expect(stats.summary.actualExpense).toBe(350);
    });

    it('still rejects a batch containing a foreign transaction id', async () => {
      const { realTx, budget } = await seedBudgetWithPlannedTransaction();

      const response = await helpers.addTransactionToCustomBudget({
        id: budget.id,
        payload: { transactionIds: [realTx.id, generateRandomRecordId()] },
        raw: false,
      });

      expect(response.statusCode).toEqual(ERROR_CODES.ValidationError);

      const linked = await helpers.getTransactions({ budgetIds: [budget.id], limit: 30, raw: true });
      expect(linked).toEqual([]);
    });
  });
});
