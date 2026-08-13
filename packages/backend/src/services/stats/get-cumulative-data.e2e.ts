import { TRANSACTION_TYPES } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import * as helpers from '@tests/helpers';

// Fixed windows in the past: the report stops iterating at the current month, so a window that
// reaches into the future would report fewer months than it was asked for.
const JAN = { from: '2026-01-01', to: '2026-01-31' };
const FEB = { from: '2026-02-01', to: '2026-02-28' };

describe('GET /stats/cumulative', () => {
  it('excludes planned expenses from the cumulative total', async () => {
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

    const result = await helpers.getCumulativeData({ ...JAN, metric: 'expenses', raw: true });

    expect(result.currentPeriod.total).toBe(300);
    expect(result.currentPeriod.data[0]!.periodValue).toBe(300);
  });

  it('excludes planned income from the cumulative total', async () => {
    const account = await helpers.createAccount({ raw: true });

    await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 500,
        transactionType: TRANSACTION_TYPES.income,
        time: '2026-02-05T12:00:00.000Z',
      }),
      raw: true,
    });
    await helpers.createPlannedTransaction({
      payload: {
        accountId: account.id,
        amount: 200,
        transactionType: TRANSACTION_TYPES.income,
        time: '2026-02-15T12:00:00.000Z',
      },
      raw: true,
    });

    const result = await helpers.getCumulativeData({ ...FEB, metric: 'income', raw: true });

    expect(result.currentPeriod.total).toBe(500);
    expect(result.currentPeriod.data[0]!.periodValue).toBe(500);
  });

  it('nets a fully refunded expense out of the cumulative expense total', async () => {
    const account = await helpers.createAccount({ raw: true });

    const [refundedExpense] = await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 400,
        transactionType: TRANSACTION_TYPES.expense,
        time: '2026-01-10T12:00:00.000Z',
      }),
      raw: true,
    });
    const [refundTx] = await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 400,
        transactionType: TRANSACTION_TYPES.income,
        time: '2026-01-20T12:00:00.000Z',
      }),
      raw: true,
    });
    await helpers.createSingleRefund({ originalTxId: refundedExpense.id, refundTxId: refundTx.id });

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

    const result = await helpers.getCumulativeData({ ...JAN, metric: 'expenses', raw: true });

    expect(result.currentPeriod.total).toBe(100);
    expect(result.currentPeriod.data[0]!.periodValue).toBe(100);
  });

  it('keeps a partial refund out of both the expense and the income totals', async () => {
    const account = await helpers.createAccount({ raw: true });

    const [expenseTx] = await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 400,
        transactionType: TRANSACTION_TYPES.expense,
        time: '2026-01-10T12:00:00.000Z',
      }),
      raw: true,
    });
    const [refundTx] = await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 150,
        transactionType: TRANSACTION_TYPES.income,
        time: '2026-01-20T12:00:00.000Z',
      }),
      raw: true,
    });
    await helpers.createSingleRefund({ originalTxId: expenseTx.id, refundTxId: refundTx.id });

    const expenses = await helpers.getCumulativeData({ ...JAN, metric: 'expenses', raw: true });
    const income = await helpers.getCumulativeData({ ...JAN, metric: 'income', raw: true });

    // 400 charged, 150 returned: 250 was spent and nothing was earned.
    expect(expenses.currentPeriod.total).toBe(250);
    expect(income.currentPeriod.total).toBe(0);
  });
});
