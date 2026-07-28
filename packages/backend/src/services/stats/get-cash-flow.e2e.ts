import { RESOURCE_TYPES, SHARE_PERMISSIONS, TRANSACTIONS_WRITE_SCOPES, TRANSACTION_TYPES } from '@bt/shared/types';
import { generateRandomRecordId } from '@common/lib/record-id-helpers';
import { describe, expect, it } from '@jest/globals';
import * as helpers from '@tests/helpers';

const uniqueName = (prefix: string): string => `${prefix}-${generateRandomRecordId()}`;

/**
 * CRIT7 — GET /stats/cash-flow
 *
 * Regression: User B creates tx on User A's shared account using User A's category.
 * When User B fetches cash-flow, categoryId must resolve to User A's category name/color
 * (not fall back to "Unknown") because getCashFlow now uses getAccessibleCategoryOwnerIds
 * to build the category map.
 */

async function provisionRecipient() {
  const handle = await helpers.signUpSecondUser();
  await helpers.asUser({
    cookies: handle.cookies,
    fn: async () => {
      const res = await helpers.setBaseCurrencyForActiveUser({ currencyCode: global.BASE_CURRENCY.code });
      if (res.statusCode !== 200) {
        throw new Error(`Failed to set base currency: ${res.statusCode} ${JSON.stringify(res.body)}`);
      }
    },
  });
  return handle;
}

/** Fixed date range that spans a single monthly bucket. */
const RANGE = {
  from: '2025-01-01',
  to: '2025-01-31',
  granularity: 'monthly' as const,
};

const TX_TIME = '2025-01-15T12:00:00.000Z';

describe('GET /stats/cash-flow', () => {
  it('single-user happy path: own transactions reflected in cash flow', async () => {
    const account = await helpers.createAccount({ raw: true });

    await helpers.createTransaction({
      payload: {
        ...helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 50,
          transactionType: TRANSACTION_TYPES.expense,
        }),
        time: TX_TIME,
      },
      raw: true,
    });
    await helpers.createTransaction({
      payload: {
        ...helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 100,
          transactionType: TRANSACTION_TYPES.income,
        }),
        time: TX_TIME,
      },
      raw: true,
    });

    const result = await helpers.getCashFlow({ ...RANGE, raw: true });

    expect(result.periods).toHaveLength(1);
    const period = result.periods[0]!;
    // amounts are serialized as decimals
    expect(period.expenses).toBe(50);
    expect(period.income).toBe(100);
    expect(period.netFlow).toBe(50);
    expect(result.totals.income).toBe(100);
    expect(result.totals.expenses).toBe(50);
  });

  it('returns empty cash flow when caller has no transactions in the range', async () => {
    const result = await helpers.getCashFlow({ ...RANGE, raw: true });

    expect(result.periods).toHaveLength(1);
    const period = result.periods[0]!;
    expect(period.income).toBe(0);
    expect(period.expenses).toBe(0);
    expect(result.totals.income).toBe(0);
    expect(result.totals.expenses).toBe(0);
  });

  it('rejects an inverted range (from later than to) with 422', async () => {
    const response = await helpers.getCashFlow({
      from: '2025-01-31',
      to: '2025-01-01',
      granularity: 'monthly',
    });

    expect(response.statusCode).toBe(422);
  });

  it('rejects a malformed / non-real date with 422', async () => {
    const response = await helpers.getCashFlow({
      // Month 13 / day 45 is not a real calendar date.
      from: '2025-13-45',
      to: '2025-01-31',
      granularity: 'monthly',
    });

    expect(response.statusCode).toBe(422);
  });

  it('shared-account regression: recipient tx using owner category resolves correctly (no "Unknown" leak)', async () => {
    // Arrange: owner creates account + category
    const ownerAccount = await helpers.createAccount({ raw: true });
    const ownerCategory = await helpers.addCustomCategory({
      name: 'Owner Groceries',
      color: '#AABBCC',
      raw: true,
    });

    // Owner creates a tx on their own account using their own category
    await helpers.createTransaction({
      payload: {
        ...helpers.buildTransactionPayload({
          accountId: ownerAccount.id,
          amount: 30,
          transactionType: TRANSACTION_TYPES.expense,
          categoryId: ownerCategory.id,
        }),
        time: TX_TIME,
      },
      raw: true,
    });

    // Share account with recipient (write/all so recipient can create txs)
    const recipient = await provisionRecipient();
    const invitation = await helpers.createShareInvitation({
      inviteeEmail: recipient.email,
      resourceType: RESOURCE_TYPES.account,
      resourceId: ownerAccount.id,
      permission: SHARE_PERMISSIONS.write,
      policy: { transactionsWriteScope: TRANSACTIONS_WRITE_SCOPES.all },
      raw: true,
    });
    await helpers.asUser({
      cookies: recipient.cookies,
      fn: () => helpers.acceptShareInvitation({ token: invitation.token, raw: true }),
    });

    // Recipient creates tx on owner's account using owner's category
    await helpers.asUser({
      cookies: recipient.cookies,
      fn: () =>
        helpers.createTransaction({
          payload: {
            ...helpers.buildTransactionPayload({
              accountId: ownerAccount.id,
              amount: 20,
              transactionType: TRANSACTION_TYPES.expense,
              categoryId: ownerCategory.id,
            }),
            time: TX_TIME,
          },
          raw: true,
        }),
    });

    // Act: recipient fetches cash-flow
    const result = await helpers.asUser({
      cookies: recipient.cookies,
      fn: () => helpers.getCashFlow({ ...RANGE, raw: true }),
    });

    // Assert: recipient sees their own tx in cash-flow (tx.userId === recipient)
    expect(result.periods).toHaveLength(1);
    const period = result.periods[0]!;
    expect(period.expenses).toBe(20); // only recipient's tx ($20 expense)

    // The category breakdown must resolve to the owner's category — NOT "Unknown"
    expect(period.categories).toBeDefined();
    const categoryEntry = period.categories!.find((c) => c.categoryId === ownerCategory.id);
    expect(categoryEntry).toBeDefined();
    expect(categoryEntry!.name).toBe('Owner Groceries');
    expect(categoryEntry!.name).not.toBe('Unknown');
    expect(categoryEntry!.color).toBe('#AABBCC');
  });
});

describe('GET /stats/cash-flow — refunds and splits', () => {
  it('nets a refund out of expenses instead of counting it as income', async () => {
    const account = await helpers.createAccount({ raw: true });
    const category = await helpers.addCustomCategory({ name: uniqueName('Refundable'), color: '#0000aa', raw: true });

    const [expenseTx] = await helpers.createTransaction({
      payload: {
        ...helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 100,
          transactionType: TRANSACTION_TYPES.expense,
          categoryId: category.id,
        }),
        time: '2025-01-10T12:00:00.000Z',
      },
      raw: true,
    });
    const [refundTx] = await helpers.createTransaction({
      payload: {
        ...helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 30,
          transactionType: TRANSACTION_TYPES.income,
          categoryId: category.id,
        }),
        time: '2025-01-20T12:00:00.000Z',
      },
      raw: true,
    });
    await helpers.createSingleRefund({ originalTxId: expenseTx.id, refundTxId: refundTx.id });

    const result = await helpers.getCashFlow({ ...RANGE, raw: true });

    const period = result.periods[0]!;
    expect(period.expenses).toBe(70);
    expect(period.income).toBe(0);
    // Net cash is unchanged by how the refund is presented: 100 out, 30 back.
    expect(period.netFlow).toBe(-70);

    const categoryEntry = period.categories!.find((entry) => entry.categoryId === category.id)!;
    expect(categoryEntry.expenseAmount).toBe(70);
    expect(categoryEntry.incomeAmount).toBe(0);
  });

  it('nets an expense that refunds an income out of income instead of counting it as spend', async () => {
    const account = await helpers.createAccount({ raw: true });
    const category = await helpers.addCustomCategory({ name: uniqueName('Salary'), color: '#00aa00', raw: true });

    const [incomeTx] = await helpers.createTransaction({
      payload: {
        ...helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 100,
          transactionType: TRANSACTION_TYPES.income,
          categoryId: category.id,
        }),
        time: '2025-01-10T12:00:00.000Z',
      },
      raw: true,
    });
    const [refundTx] = await helpers.createTransaction({
      payload: {
        ...helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 30,
          transactionType: TRANSACTION_TYPES.expense,
          categoryId: category.id,
        }),
        time: '2025-01-20T12:00:00.000Z',
      },
      raw: true,
    });
    await helpers.createSingleRefund({ originalTxId: incomeTx.id, refundTxId: refundTx.id });

    const result = await helpers.getCashFlow({ ...RANGE, raw: true });

    const period = result.periods[0]!;
    expect(period.income).toBe(70);
    expect(period.expenses).toBe(0);
    expect(period.netFlow).toBe(70);
  });

  it('lands a cross-period refund in the bucket the money returned in', async () => {
    const account = await helpers.createAccount({ raw: true });
    const category = await helpers.addCustomCategory({ name: uniqueName('LateRefund'), color: '#aa00aa', raw: true });

    const [expenseTx] = await helpers.createTransaction({
      payload: {
        ...helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 100,
          transactionType: TRANSACTION_TYPES.expense,
          categoryId: category.id,
        }),
        time: '2025-01-10T12:00:00.000Z',
      },
      raw: true,
    });
    const [refundTx] = await helpers.createTransaction({
      payload: {
        ...helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 30,
          transactionType: TRANSACTION_TYPES.income,
          categoryId: category.id,
        }),
        time: '2025-02-05T12:00:00.000Z',
      },
      raw: true,
    });
    await helpers.createSingleRefund({ originalTxId: expenseTx.id, refundTxId: refundTx.id });

    const result = await helpers.getCashFlow({
      from: '2025-01-01',
      to: '2025-02-28',
      granularity: 'monthly',
      raw: true,
    });

    const [january, february] = result.periods;
    expect(january!.expenses).toBe(100);
    expect(january!.netFlow).toBe(-100);
    // February's money-in is a reversal of spend, so it lowers expenses rather than raising income —
    // the period's net cash (+30) stays the same either way.
    expect(february!.expenses).toBe(-30);
    expect(february!.income).toBe(0);
    expect(february!.netFlow).toBe(30);

    expect(result.totals.expenses).toBe(70);
    expect(result.totals.income).toBe(0);
    expect(result.totals.netFlow).toBe(-70);
  });

  it('distributes a split transaction across its categories in the breakdown', async () => {
    const account = await helpers.createAccount({ raw: true });
    const primaryCategory = await helpers.addCustomCategory({
      name: uniqueName('Primary'),
      color: '#aa1100',
      raw: true,
    });
    const splitCategory = await helpers.addCustomCategory({
      name: uniqueName('SplitTarget'),
      color: '#0011aa',
      raw: true,
    });

    await helpers.createTransaction({
      payload: {
        ...helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 100,
          transactionType: TRANSACTION_TYPES.expense,
          categoryId: primaryCategory.id,
          splits: [{ categoryId: splitCategory.id, amount: 30 }],
        }),
        time: '2025-01-10T12:00:00.000Z',
      },
      raw: true,
    });

    const result = await helpers.getCashFlow({ ...RANGE, raw: true });

    const period = result.periods[0]!;
    expect(period.expenses).toBe(100);

    const primaryEntry = period.categories!.find((entry) => entry.categoryId === primaryCategory.id);
    const splitEntry = period.categories!.find((entry) => entry.categoryId === splitCategory.id);
    expect(primaryEntry).toBeDefined();
    expect(splitEntry).toBeDefined();
    expect(primaryEntry!.expenseAmount).toBe(70);
    expect(splitEntry!.expenseAmount).toBe(30);
  });

  it('applies a split-targeted refund to the split category only', async () => {
    const account = await helpers.createAccount({ raw: true });
    const primaryCategory = await helpers.addCustomCategory({
      name: uniqueName('Primary'),
      color: '#aa1100',
      raw: true,
    });
    const splitCategory = await helpers.addCustomCategory({
      name: uniqueName('SplitTarget'),
      color: '#0011aa',
      raw: true,
    });

    const [expenseTx] = await helpers.createTransaction({
      payload: {
        ...helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 100,
          transactionType: TRANSACTION_TYPES.expense,
          categoryId: primaryCategory.id,
          splits: [{ categoryId: splitCategory.id, amount: 30 }],
        }),
        time: '2025-01-10T12:00:00.000Z',
      },
      raw: true,
    });

    const allTransactions = (await helpers.getTransactions({ raw: true, includeSplits: true }))!;
    const targetSplit = allTransactions.find((tx) => tx.id === expenseTx.id)!.splits![0]!;

    const [refundTx] = await helpers.createTransaction({
      payload: {
        ...helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 20,
          transactionType: TRANSACTION_TYPES.income,
          categoryId: splitCategory.id,
        }),
        time: '2025-01-20T12:00:00.000Z',
      },
      raw: true,
    });
    await helpers.createSingleRefund({ originalTxId: expenseTx.id, refundTxId: refundTx.id, splitId: targetSplit.id });

    const result = await helpers.getCashFlow({ ...RANGE, raw: true });

    const period = result.periods[0]!;
    expect(period.expenses).toBe(80);
    expect(period.income).toBe(0);

    const primaryEntry = period.categories!.find((entry) => entry.categoryId === primaryCategory.id)!;
    const splitEntry = period.categories!.find((entry) => entry.categoryId === splitCategory.id)!;
    expect(primaryEntry.expenseAmount).toBe(70);
    expect(splitEntry.expenseAmount).toBe(10);
  });

  it('reports the same expense total as the expenses-structure report over the same range', async () => {
    const account = await helpers.createAccount({ raw: true });
    const primaryCategory = await helpers.addCustomCategory({
      name: uniqueName('Primary'),
      color: '#aa1100',
      raw: true,
    });
    const splitCategory = await helpers.addCustomCategory({
      name: uniqueName('SplitTarget'),
      color: '#0011aa',
      raw: true,
    });

    const [expenseTx] = await helpers.createTransaction({
      payload: {
        ...helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 100,
          transactionType: TRANSACTION_TYPES.expense,
          categoryId: primaryCategory.id,
          splits: [{ categoryId: splitCategory.id, amount: 30 }],
        }),
        time: '2025-01-10T12:00:00.000Z',
      },
      raw: true,
    });
    const [refundTx] = await helpers.createTransaction({
      payload: {
        ...helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 25,
          transactionType: TRANSACTION_TYPES.income,
          categoryId: primaryCategory.id,
        }),
        time: '2025-01-20T12:00:00.000Z',
      },
      raw: true,
    });
    await helpers.createSingleRefund({ originalTxId: expenseTx.id, refundTxId: refundTx.id });

    const cashFlow = await helpers.getCashFlow({ ...RANGE, raw: true });
    const expensesStructureTotal = await helpers.getExpensesAmountForPeriod({
      from: RANGE.from,
      to: RANGE.to,
      raw: true,
    });

    expect(cashFlow.totals.expenses).toBe(expensesStructureTotal);
    expect(cashFlow.totals.expenses).toBe(75);
  });

  it('leaves both sides gross when the range holds only one half of a refund pair', async () => {
    const account = await helpers.createAccount({ raw: true });
    const category = await helpers.addCustomCategory({ name: uniqueName('OutOfRange'), color: '#123456', raw: true });

    // The purchase sits before the queried range; only the refund lands inside it.
    const [expenseTx] = await helpers.createTransaction({
      payload: {
        ...helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 100,
          transactionType: TRANSACTION_TYPES.expense,
          categoryId: category.id,
        }),
        time: '2024-12-10T12:00:00.000Z',
      },
      raw: true,
    });
    const [refundTx] = await helpers.createTransaction({
      payload: {
        ...helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 30,
          transactionType: TRANSACTION_TYPES.income,
          categoryId: category.id,
        }),
        time: '2025-01-20T12:00:00.000Z',
      },
      raw: true,
    });
    await helpers.createSingleRefund({ originalTxId: expenseTx.id, refundTxId: refundTx.id });

    const result = await helpers.getCashFlow({ ...RANGE, raw: true });

    // Netting only the in-range half would erase the $30 that actually arrived in January.
    const period = result.periods[0]!;
    expect(period.income).toBe(30);
    expect(period.expenses).toBe(0);
    expect(period.netFlow).toBe(30);
  });

  it('keeps a refund credited to another account out of the netting when scoped to one account', async () => {
    const spendAccount = await helpers.createAccount({ raw: true });
    const refundAccount = await helpers.createAccount({ raw: true });
    const category = await helpers.addCustomCategory({ name: uniqueName('CrossAcc'), color: '#654321', raw: true });

    const [expenseTx] = await helpers.createTransaction({
      payload: {
        ...helpers.buildTransactionPayload({
          accountId: spendAccount.id,
          amount: 100,
          transactionType: TRANSACTION_TYPES.expense,
          categoryId: category.id,
        }),
        time: '2025-01-10T12:00:00.000Z',
      },
      raw: true,
    });
    const [refundTx] = await helpers.createTransaction({
      payload: {
        ...helpers.buildTransactionPayload({
          accountId: refundAccount.id,
          amount: 30,
          transactionType: TRANSACTION_TYPES.income,
          categoryId: category.id,
        }),
        time: '2025-01-20T12:00:00.000Z',
      },
      raw: true,
    });
    await helpers.createSingleRefund({ originalTxId: expenseTx.id, refundTxId: refundTx.id });

    const scoped = await helpers.getCashFlow({ ...RANGE, accountId: spendAccount.id, raw: true });

    // The refund never entered this account's income, so it must not be taken out of it either.
    const period = scoped.periods[0]!;
    expect(period.income).toBe(0);
    expect(period.expenses).toBe(100);
    expect(period.netFlow).toBe(-100);

    // Unscoped, both halves are present and the pair nets as usual.
    const unscoped = await helpers.getCashFlow({ ...RANGE, raw: true });
    expect(unscoped.periods[0]!.expenses).toBe(70);
    expect(unscoped.periods[0]!.income).toBe(0);
  });

  it('counts a refund with no in-system original as plain income', async () => {
    const account = await helpers.createAccount({ raw: true });

    const [refundTx] = await helpers.createTransaction({
      payload: {
        ...helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 40,
          transactionType: TRANSACTION_TYPES.income,
        }),
        time: '2025-01-15T12:00:00.000Z',
      },
      raw: true,
    });
    await helpers.createSingleRefund({ originalTxId: null, refundTxId: refundTx.id });

    const result = await helpers.getCashFlow({ ...RANGE, raw: true });

    const period = result.periods[0]!;
    expect(period.income).toBe(40);
    expect(period.expenses).toBe(0);
  });

  it('nets each of several partial refunds against the same original', async () => {
    const account = await helpers.createAccount({ raw: true });
    const category = await helpers.addCustomCategory({ name: uniqueName('Partial'), color: '#abcdef', raw: true });

    const [expenseTx] = await helpers.createTransaction({
      payload: {
        ...helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 100,
          transactionType: TRANSACTION_TYPES.expense,
          categoryId: category.id,
        }),
        time: '2025-01-05T12:00:00.000Z',
      },
      raw: true,
    });

    for (const amount of [20, 30]) {
      const [refundTx] = await helpers.createTransaction({
        payload: {
          ...helpers.buildTransactionPayload({
            accountId: account.id,
            amount,
            transactionType: TRANSACTION_TYPES.income,
            categoryId: category.id,
          }),
          time: '2025-01-15T12:00:00.000Z',
        },
        raw: true,
      });
      await helpers.createSingleRefund({ originalTxId: expenseTx.id, refundTxId: refundTx.id });
    }

    const result = await helpers.getCashFlow({ ...RANGE, raw: true });

    const period = result.periods[0]!;
    expect(period.expenses).toBe(50);
    expect(period.income).toBe(0);
    expect(period.netFlow).toBe(-50);
  });

  it('distributes an income transaction split across its categories', async () => {
    const account = await helpers.createAccount({ raw: true });
    const primaryCategory = await helpers.addCustomCategory({
      name: uniqueName('IncomePrimary'),
      color: '#00ffaa',
      raw: true,
    });
    const splitCategory = await helpers.addCustomCategory({
      name: uniqueName('IncomeSplit'),
      color: '#aa00ff',
      raw: true,
    });

    await helpers.createTransaction({
      payload: {
        ...helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 100,
          transactionType: TRANSACTION_TYPES.income,
          categoryId: primaryCategory.id,
          splits: [{ categoryId: splitCategory.id, amount: 40 }],
        }),
        time: '2025-01-10T12:00:00.000Z',
      },
      raw: true,
    });

    const result = await helpers.getCashFlow({ ...RANGE, raw: true });

    const period = result.periods[0]!;
    expect(period.income).toBe(100);

    const primaryEntry = period.categories!.find((entry) => entry.categoryId === primaryCategory.id);
    const splitEntry = period.categories!.find((entry) => entry.categoryId === splitCategory.id);
    expect(primaryEntry).toBeDefined();
    expect(splitEntry).toBeDefined();
    expect(primaryEntry!.incomeAmount).toBe(60);
    expect(splitEntry!.incomeAmount).toBe(40);
  });
});
