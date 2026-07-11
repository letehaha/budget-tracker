import { RESOURCE_TYPES, SHARE_PERMISSIONS, TRANSACTIONS_WRITE_SCOPES, TRANSACTION_TYPES } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import * as helpers from '@tests/helpers';

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
