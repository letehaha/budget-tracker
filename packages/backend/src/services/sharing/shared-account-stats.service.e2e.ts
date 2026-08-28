import {
  ACCOUNT_CATEGORIES,
  RESOURCE_TYPES,
  SHARE_PERMISSIONS,
  TRANSACTIONS_WRITE_SCOPES,
  TRANSACTION_TYPES,
} from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import * as helpers from '@tests/helpers';
import { addDays, format, subDays } from 'date-fns';

/**
 * Reports on a shared account count every row on it, not only the ones the caller authored —
 * except planned rows, which stay with whoever made them, and accounts nobody shared with the
 * caller. Net worth is the one surface that counts ownership instead of access, so a shared
 * account belongs in the balance numbers and not in that one.
 */

const WINDOW = () => ({
  from: format(subDays(new Date(), 30), 'yyyy-MM-dd'),
  to: format(addDays(new Date(), 30), 'yyyy-MM-dd'),
});

const OWNER_EXPENSE = 100;
const RECIPIENT_EXPENSE = 250;
const OWNER_PLANNED_EXPENSE = 9999;

const OWNER_TX_DATE = () => subDays(new Date(), 20);
const RECIPIENT_TX_DATE = () => subDays(new Date(), 10);
const PLANNED_TX_DATE = () => addDays(new Date(), 5);

async function shareAccountWith({ accountId, recipient }: { accountId: string; recipient: helpers.SecondUserHandle }) {
  const invitation = await helpers.createShareInvitation({
    inviteeEmail: recipient.email,
    resourceType: RESOURCE_TYPES.account,
    resourceId: accountId,
    permission: SHARE_PERMISSIONS.write,
    policy: { transactionsWriteScope: TRANSACTIONS_WRITE_SCOPES.all },
    raw: true,
  });
  await helpers.asUser({
    cookies: recipient.cookies,
    fn: () => helpers.acceptShareInvitation({ token: invitation.token, raw: true }),
  });
}

/**
 * Owner account with one expense from each side, mirroring the reproduction in the report.
 * `initialBalance: 0` keeps the balance-adjustment row out of the picture: it is excluded
 * from every report here except `earliest-transaction-date`, which would otherwise anchor
 * on account creation instead of on the owner's oldest transaction.
 */
async function seedSharedAccount() {
  const account = await helpers.createAccount({
    payload: helpers.buildAccountPayload({ name: 'Shared Checking', initialBalance: 0 }),
    raw: true,
  });
  const recipient = await helpers.provisionSecondUserWithBaseCurrency();
  await shareAccountWith({ accountId: account.id, recipient });

  await helpers.createTransaction({
    payload: {
      ...helpers.buildTransactionPayload({
        accountId: account.id,
        amount: OWNER_EXPENSE,
        transactionType: TRANSACTION_TYPES.expense,
      }),
      time: OWNER_TX_DATE().toISOString(),
    },
    raw: true,
  });

  await helpers.asUser({
    cookies: recipient.cookies,
    fn: () =>
      helpers.createTransaction({
        payload: {
          ...helpers.buildTransactionPayload({
            accountId: account.id,
            amount: RECIPIENT_EXPENSE,
            transactionType: TRANSACTION_TYPES.expense,
          }),
          time: RECIPIENT_TX_DATE().toISOString(),
        },
        raw: true,
      }),
  });

  return { account, recipient };
}

describe('Stats on a shared account', () => {
  describe('the recipient sees the whole account, not just their own rows', () => {
    it('counts both sides in the expenses amount for the period', async () => {
      const { recipient } = await seedSharedAccount();

      const amount = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.getExpensesAmountForPeriod({ ...WINDOW(), raw: true }),
      });

      expect(amount).toBe(OWNER_EXPENSE + RECIPIENT_EXPENSE);
    });

    it('counts both sides in the cash flow', async () => {
      const { recipient } = await seedSharedAccount();

      const result = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.getCashFlow({ ...WINDOW(), granularity: 'monthly', raw: true }),
      });

      expect(result.totals.expenses).toBe(OWNER_EXPENSE + RECIPIENT_EXPENSE);
    });

    it('counts both sides in the cumulative data', async () => {
      const { recipient } = await seedSharedAccount();

      const result = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.getCumulativeData({ ...WINDOW(), metric: 'expenses', raw: true }),
      });

      expect(result.currentPeriod.total).toBe(OWNER_EXPENSE + RECIPIENT_EXPENSE);
    });

    it('counts both sides in the pivot report', async () => {
      const { recipient } = await seedSharedAccount();

      const result = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () =>
          helpers.getPivotReport({
            ...WINDOW(),
            granularity: 'monthly',
            rowDimension: 'category',
            measure: 'expense',
            raw: true,
          }),
      });

      expect(result.grandTotal).toBe(OWNER_EXPENSE + RECIPIENT_EXPENSE);
    });

    it('reaches back to the owner’s oldest transaction for the earliest date', async () => {
      const { recipient } = await seedSharedAccount();

      const earliest = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.getEarliestTransactionDate({ raw: true }),
      });

      expect(earliest).toBe(format(OWNER_TX_DATE(), 'yyyy-MM-dd'));
    });

    it('serves the shared account’s balance history when asked for it by id', async () => {
      // Naming one account by id authorizes on access, not ownership, so the series matches
      // the balance the app already shows the recipient for that account.
      const { account, recipient } = await seedSharedAccount();

      const history = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.getBalanceHistory({ ...WINDOW(), accountId: account.id, raw: true }),
      });

      expect(history.length).toBeGreaterThan(0);
      expect(history.at(-1)!.amount).toBe(-(OWNER_EXPENSE + RECIPIENT_EXPENSE));
    });

    it('includes the shared account in the balance history', async () => {
      const { recipient } = await seedSharedAccount();

      const history = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.getBalanceHistory({ ...WINDOW(), raw: true }),
      });

      // The recipient owns no accounts of their own here, so the series is the shared
      // account's alone and its last point is the balance both sides moved.
      expect(history.length).toBeGreaterThan(0);
      expect(history.at(-1)!.amount).toBe(-(OWNER_EXPENSE + RECIPIENT_EXPENSE));
    });
  });

  describe('the boundary holds', () => {
    it('shows nothing of an account that was never shared with the caller', async () => {
      await seedSharedAccount();
      const stranger = await helpers.provisionSecondUserWithBaseCurrency();

      const amount = await helpers.asUser({
        cookies: stranger.cookies,
        fn: () => helpers.getExpensesAmountForPeriod({ ...WINDOW(), raw: true }),
      });

      expect(amount).toBe(0);
    });

    it('keeps the owner’s planned rows out of the recipient’s cash flow', async () => {
      // `excludePlanned` defaults to false, so the report includes planned rows — but a
      // plan is an intention of whoever made it. Widening the row scope to the whole
      // account must not turn the owner's plans into the recipient's forecast.
      const { account, recipient } = await seedSharedAccount();

      await helpers.createPlannedTransaction({
        payload: {
          ...helpers.buildTransactionPayload({
            accountId: account.id,
            amount: OWNER_PLANNED_EXPENSE,
            transactionType: TRANSACTION_TYPES.expense,
          }),
          time: PLANNED_TX_DATE().toISOString(),
        },
        raw: true,
      });

      const result = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.getCashFlow({ ...WINDOW(), granularity: 'monthly', raw: true }),
      });

      expect(result.totals.expenses).toBe(OWNER_EXPENSE + RECIPIENT_EXPENSE);
    });

    it('keeps the owner’s planned rows out of the recipient’s expenses total', async () => {
      const { account, recipient } = await seedSharedAccount();

      await helpers.createPlannedTransaction({
        payload: {
          ...helpers.buildTransactionPayload({
            accountId: account.id,
            amount: OWNER_PLANNED_EXPENSE,
            transactionType: TRANSACTION_TYPES.expense,
          }),
          time: PLANNED_TX_DATE().toISOString(),
        },
        raw: true,
      });

      const recipientAmount = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.getExpensesAmountForPeriod({ ...WINDOW(), raw: true }),
      });
      const ownerAmount = await helpers.getExpensesAmountForPeriod({ ...WINDOW(), raw: true });

      expect(recipientAmount).toBe(OWNER_EXPENSE + RECIPIENT_EXPENSE);
      // The owner's total keeps the recipient's honest: without it, a plan that landed in no
      // report at all would pass just as well.
      expect(ownerAmount).toBe(OWNER_EXPENSE + RECIPIENT_EXPENSE + OWNER_PLANNED_EXPENSE);
    });

    it('keeps the recipient’s own plans on their own account in their cash flow', async () => {
      // Only the account owner may plan on a shared account ("Only the account owner can
      // create planned transactions"), so `{ visibleTo }` cannot cost a recipient anything
      // there. What it must not do is drop the plans they made on their own accounts.
      const { recipient } = await seedSharedAccount();

      await helpers.asUser({
        cookies: recipient.cookies,
        fn: async () => {
          const own = await helpers.createAccount({
            payload: helpers.buildAccountPayload({ name: 'Recipient Wallet', initialBalance: 0 }),
            raw: true,
          });
          // A category of their own: the payload builder falls back to the seeded default,
          // which belongs to the owner and 404s on an account the owner cannot see.
          const ownCategory = await helpers.addCustomCategory({
            name: 'Recipient Category',
            color: '#00FF00',
            raw: true,
          });
          await helpers.createPlannedTransaction({
            payload: {
              ...helpers.buildTransactionPayload({
                accountId: own.id,
                amount: OWNER_PLANNED_EXPENSE,
                transactionType: TRANSACTION_TYPES.expense,
                categoryId: ownCategory.id,
              }),
              time: PLANNED_TX_DATE().toISOString(),
            },
            raw: true,
          });
        },
      });

      const result = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.getCashFlow({ ...WINDOW(), granularity: 'monthly', raw: true }),
      });

      expect(result.totals.expenses).toBe(OWNER_EXPENSE + RECIPIENT_EXPENSE + OWNER_PLANNED_EXPENSE);
    });

    it('still shows the owner their own plans on the account they share out', async () => {
      const { account } = await seedSharedAccount();

      await helpers.createPlannedTransaction({
        payload: {
          ...helpers.buildTransactionPayload({
            accountId: account.id,
            amount: OWNER_PLANNED_EXPENSE,
            transactionType: TRANSACTION_TYPES.expense,
          }),
          time: PLANNED_TX_DATE().toISOString(),
        },
        raw: true,
      });

      const result = await helpers.getCashFlow({ ...WINDOW(), granularity: 'monthly', raw: true });

      expect(result.totals.expenses).toBe(OWNER_EXPENSE + RECIPIENT_EXPENSE + OWNER_PLANNED_EXPENSE);
    });
  });
  describe('net worth stays personal', () => {
    const SHARED_BALANCE = 5000;

    /** An account with real money in it, shared with a second user. */
    async function seedFundedSharedAccount({
      accountOverrides,
    }: { accountOverrides?: Parameters<typeof helpers.buildAccountPayload>[0] } = {}) {
      const account = await helpers.createAccount({
        payload: helpers.buildAccountPayload({
          name: 'Owner Savings',
          initialBalance: SHARED_BALANCE,
          ...accountOverrides,
        }),
        raw: true,
      });
      const recipient = await helpers.provisionSecondUserWithBaseCurrency();
      await shareAccountWith({ accountId: account.id, recipient });
      return { account, recipient };
    }

    it('leaves a shared account out of the recipient’s net worth', async () => {
      // The counterpart of every other test in this file: `getPerAccountBalanceHistory`
      // and `getAggregatedBalanceHistory` share `getBalanceHistoryRows` with
      // `/stats/balance-history`, so widening that helper reached net worth as well — and
      // net worth's other components (portfolios, vehicles, ventures) are owner-only, so a
      // shared account there would put two scopes on one chart.
      const { recipient } = await seedFundedSharedAccount();

      const result = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.getNetWorthHistory({ ...WINDOW(), granularity: 'monthly', raw: true }),
      });

      expect(result.points.length).toBeGreaterThan(0);
      for (const point of result.points) {
        expect(point.assets.cash).toBe(0);
        expect(point.assetsTotal).toBe(0);
      }
    });

    it('still counts it in the balance surfaces, which is the whole distinction', async () => {
      const { recipient } = await seedFundedSharedAccount();

      const [history, total] = await helpers.asUser({
        cookies: recipient.cookies,
        fn: async () =>
          Promise.all([
            helpers.getBalanceHistory({ ...WINDOW(), raw: true }),
            helpers.getTotalBalance({ date: format(new Date(), 'yyyy-MM-dd'), raw: true }),
          ]),
      });

      expect(history.at(-1)!.amount).toBe(SHARED_BALANCE);
      expect(total).toBe(SHARED_BALANCE);
    });

    it('subtracts a shared credit card’s limit from the recipient’s total balance', async () => {
      const CREDIT_LIMIT = 3000;
      const { recipient } = await seedFundedSharedAccount({
        accountOverrides: { accountCategory: ACCOUNT_CATEGORIES.creditCard, creditLimit: CREDIT_LIMIT },
      });

      const total = await helpers.asUser({
        cookies: recipient.cookies,
        fn: async () => {
          await helpers.updateUserSettings({
            settings: { locale: 'en', includeCreditLimitInStats: true },
            raw: true,
          });
          return helpers.getTotalBalance({ date: format(new Date(), 'yyyy-MM-dd'), raw: true });
        },
      });

      expect(total).toBe(SHARED_BALANCE - CREDIT_LIMIT);
    });

    it('still shows the owner their own account in their net worth', async () => {
      const { account } = await seedFundedSharedAccount();
      expect(account.id).toBeDefined();

      const result = await helpers.getNetWorthHistory({ ...WINDOW(), granularity: 'monthly', raw: true });

      expect(result.points.at(-1)!.assets.cash).toBe(SHARED_BALANCE);
    });
  });
});
