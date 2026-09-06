import { TRANSACTION_TYPES } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import * as helpers from '@tests/helpers';

// Fixed windows in the past: the report stops iterating at the current month, so a window that
// reaches into the future would report fewer months than it was asked for.
const JAN = { from: '2026-01-01', to: '2026-01-31' };

describe('GET /stats/cumulative', () => {
  it('excludes planned rows from both the expense and the income cumulative totals', async () => {
    const account = await helpers.createAccount({ raw: true });

    await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 300,
        transactionType: TRANSACTION_TYPES.expense,
        time: '2026-01-10T12:00:00.000Z',
      }),
      raw: true,
    });
    await helpers.createPlannedTransaction({
      payload: {
        accountId: account.id,
        amount: 120,
        transactionType: TRANSACTION_TYPES.expense,
        time: '2026-01-20T12:00:00.000Z',
      },
      raw: true,
    });
    await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 500,
        transactionType: TRANSACTION_TYPES.income,
        time: '2026-01-05T12:00:00.000Z',
      }),
      raw: true,
    });
    await helpers.createPlannedTransaction({
      payload: {
        accountId: account.id,
        amount: 200,
        transactionType: TRANSACTION_TYPES.income,
        time: '2026-01-25T12:00:00.000Z',
      },
      raw: true,
    });

    const expenses = await helpers.getCumulativeData({ ...JAN, metric: 'expenses', raw: true });
    const income = await helpers.getCumulativeData({ ...JAN, metric: 'income', raw: true });

    expect(expenses.currentPeriod.total).toBe(300);
    expect(expenses.currentPeriod.data[0]!.periodValue).toBe(300);
    expect(income.currentPeriod.total).toBe(500);
    expect(income.currentPeriod.data[0]!.periodValue).toBe(500);
  }, 60_000);

  it('nets a full refund out entirely and keeps a partial refund out of the income total', async () => {
    const account = await helpers.createAccount({ raw: true });

    const [fullyRefundedExpense] = await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 400,
        transactionType: TRANSACTION_TYPES.expense,
        time: '2026-01-10T12:00:00.000Z',
      }),
      raw: true,
    });
    const [fullRefundTx] = await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 400,
        transactionType: TRANSACTION_TYPES.income,
        time: '2026-01-20T12:00:00.000Z',
      }),
      raw: true,
    });
    await helpers.createSingleRefund({ originalTxId: fullyRefundedExpense.id, refundTxId: fullRefundTx.id });

    // Kept unrefunded so the expected total is a real number rather than a zero any broken
    // fixture would also produce.
    await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 100,
        transactionType: TRANSACTION_TYPES.expense,
        time: '2026-01-12T12:00:00.000Z',
      }),
      raw: true,
    });

    const [partiallyRefundedExpense] = await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 400,
        transactionType: TRANSACTION_TYPES.expense,
        time: '2026-01-14T12:00:00.000Z',
      }),
      raw: true,
    });
    const [partialRefundTx] = await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 150,
        transactionType: TRANSACTION_TYPES.income,
        time: '2026-01-22T12:00:00.000Z',
      }),
      raw: true,
    });
    await helpers.createSingleRefund({ originalTxId: partiallyRefundedExpense.id, refundTxId: partialRefundTx.id });

    const expenses = await helpers.getCumulativeData({ ...JAN, metric: 'expenses', raw: true });
    const income = await helpers.getCumulativeData({ ...JAN, metric: 'income', raw: true });

    // 100 unrefunded + 250 residual of the partial refund: a leaking full refund reads 750,
    // a leaking partial refund reads 500. Neither refund is earnings.
    expect(expenses.currentPeriod.total).toBe(350);
    expect(expenses.currentPeriod.data[0]!.periodValue).toBe(350);
    expect(income.currentPeriod.total).toBe(0);
  }, 60_000);
});
