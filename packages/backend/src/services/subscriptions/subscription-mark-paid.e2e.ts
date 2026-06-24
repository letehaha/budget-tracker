import {
  SUBSCRIPTION_FREQUENCIES,
  SUBSCRIPTION_PERIOD_STATUSES,
  SUBSCRIPTION_TYPES,
  TRANSACTION_TYPES,
} from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import * as helpers from '@tests/helpers';
import { addMonths, format } from 'date-fns';

/** Returns a date string N months from today, on the given day-of-month. */
function futureDate({ monthsAhead, day }: { monthsAhead: number; day: number }): string {
  const d = addMonths(new Date(), monthsAhead);
  d.setDate(day);
  return format(d, 'yyyy-MM-dd');
}

/**
 * Seeds a UAH account with a USD subscription so the billed currency differs
 * from the account currency. The test environment ships exchange rates for all
 * currency pairs that appear in `global.MODELS_CURRENCIES`, so USD→UAH
 * conversion is available out of the box — the same pattern used in
 * scheduled-payments.e2e.ts.
 */
async function createUsdSubOnUahAccount({ expectedAmount }: { expectedAmount: number }) {
  const uah = global.MODELS_CURRENCIES!.find((c) => c.code === 'UAH')!;
  await helpers.addUserCurrencies({ currencyCodes: [uah.code] });
  const account = await helpers.createAccount({
    payload: { ...helpers.buildAccountPayload(), currencyCode: uah.code },
    raw: true,
  });
  const sub = await helpers.createSubscription({
    name: 'USD Subscription',
    frequency: SUBSCRIPTION_FREQUENCIES.monthly,
    startDate: futureDate({ monthsAhead: 1, day: 1 }),
    dueDate: futureDate({ monthsAhead: 1, day: 1 }),
    accountId: account.id,
    categoryId: global.DEFAULT_CATEGORY_ID,
    expectedAmount,
    expectedCurrencyCode: global.BASE_CURRENCY.code,
    raw: true,
  });
  return { account, sub, accountCurrencyCode: uah.code };
}

describe('POST /subscriptions/:id/periods/:periodId/pay', () => {
  describe('Same-currency create-mode', () => {
    it('marks the period paid, creates an expense tx, and generates the next upcoming period', async () => {
      const account = await helpers.createAccount({ raw: true });
      const sub = await helpers.createSubscription({
        name: 'Netflix',
        frequency: SUBSCRIPTION_FREQUENCIES.monthly,
        startDate: futureDate({ monthsAhead: 1, day: 1 }),
        dueDate: futureDate({ monthsAhead: 1, day: 1 }),
        accountId: account.id,
        categoryId: global.DEFAULT_CATEGORY_ID,
        expectedAmount: 10,
        expectedCurrencyCode: global.BASE_CURRENCY.code,
        raw: true,
      });

      const detail = await helpers.getSubscriptionById({ id: sub.id, raw: true });
      const upcomingPeriod = detail.periods.find((p) => p.status === SUBSCRIPTION_PERIOD_STATUSES.upcoming);
      expect(upcomingPeriod).toBeDefined();

      const period = await helpers.markSubscriptionPeriodPaid({
        id: sub.id,
        periodId: upcomingPeriod!.id,
        createTransaction: true,
        raw: true,
      });

      // Period is paid and has a linked auto-created transaction.
      expect(period.status).toBe(SUBSCRIPTION_PERIOD_STATUSES.paid);
      expect(period.transactionAutoCreated).toBe(true);
      expect(period.transactionId).toBeTruthy();

      // A new upcoming period was created at next month's date.
      const afterDetail = await helpers.getSubscriptionById({ id: sub.id, raw: true });
      const nextUpcoming = afterDetail.periods.find((p) => p.status === SUBSCRIPTION_PERIOD_STATUSES.upcoming);
      expect(nextUpcoming).toBeDefined();
      // Next period due date is 1 month after the paid one.
      const paidDue = new Date(upcomingPeriod!.dueDate + 'T00:00:00Z');
      const expectedNextDue = format(addMonths(paidDue, 1), 'yyyy-MM-dd');
      expect(nextUpcoming!.dueDate).toBe(expectedNextDue);

      // The created transaction is an expense on the correct account with amount = 10 (decimal).
      const tx = await helpers.getTransactionById({ id: period.transactionId!, raw: true });
      expect(tx).not.toBeNull();
      expect(tx!.transactionType).toBe(TRANSACTION_TYPES.expense);
      expect(tx!.accountId).toBe(account.id);
      expect(tx!.amount).toBe(10);
    });
  });

  describe('Cross-currency invariant', () => {
    it('books the converted UAH amount and preview matches the booking', async () => {
      const { account, sub, accountCurrencyCode } = await createUsdSubOnUahAccount({ expectedAmount: 10 });

      // GET pay-preview: must report cross-currency.
      const preview = await helpers.getSubscriptionPayPreview({ id: sub.id, raw: true });
      expect(preview.isCrossCurrency).toBe(true);
      expect(preview.accountCurrencyCode).toBe(accountCurrencyCode);
      expect(preview.subscriptionCurrencyCode).toBe(global.BASE_CURRENCY.code);
      expect(preview.expectedAmount).toBe(10);
      expect(preview.convertedAmount).not.toBeNull();
      // UAH converted value should differ from the USD nominal.
      expect(preview.convertedAmount).not.toBe(10);

      // POST pay with no override: booked amount must equal preview.convertedAmount.
      const detail = await helpers.getSubscriptionById({ id: sub.id, raw: true });
      const upcoming = detail.periods.find((p) => p.status === SUBSCRIPTION_PERIOD_STATUSES.upcoming);

      const paidPeriod = await helpers.markSubscriptionPeriodPaid({
        id: sub.id,
        periodId: upcoming!.id,
        createTransaction: true,
        raw: true,
      });

      const tx = await helpers.getTransactionById({ id: paidPeriod.transactionId!, raw: true });
      expect(tx).not.toBeNull();
      // Booked in the account's currency (UAH), not the subscription's billed currency (USD).
      expect(tx!.currencyCode).toBe(accountCurrencyCode);
      expect(tx!.accountId).toBe(account.id);
      // The booked amount must exactly match the previewed estimate.
      expect(tx!.amount).toBe(preview.convertedAmount);
    });
  });

  describe('Amount override', () => {
    it('books the explicit override amount verbatim', async () => {
      const account = await helpers.createAccount({ raw: true });
      const sub = await helpers.createSubscription({
        name: 'Power Bill',
        frequency: SUBSCRIPTION_FREQUENCIES.monthly,
        startDate: futureDate({ monthsAhead: 1, day: 1 }),
        dueDate: futureDate({ monthsAhead: 1, day: 1 }),
        accountId: account.id,
        categoryId: global.DEFAULT_CATEGORY_ID,
        expectedAmount: 10,
        expectedCurrencyCode: global.BASE_CURRENCY.code,
        raw: true,
      });

      const detail = await helpers.getSubscriptionById({ id: sub.id, raw: true });
      const upcoming = detail.periods.find((p) => p.status === SUBSCRIPTION_PERIOD_STATUSES.upcoming);

      const period = await helpers.markSubscriptionPeriodPaid({
        id: sub.id,
        periodId: upcoming!.id,
        createTransaction: true,
        amount: 425.5,
        raw: true,
      });

      const tx = await helpers.getTransactionById({ id: period.transactionId!, raw: true });
      expect(tx!.amount).toBe(425.5);
    });
  });

  describe('Link-mode (existing transaction)', () => {
    it('links the caller-supplied transaction without creating a new one', async () => {
      const account = await helpers.createAccount({ raw: true });
      const [existingTx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({ accountId: account.id }),
        raw: true,
      });

      const sub = await helpers.createSubscription({
        name: 'Rent',
        frequency: SUBSCRIPTION_FREQUENCIES.monthly,
        startDate: futureDate({ monthsAhead: 1, day: 1 }),
        dueDate: futureDate({ monthsAhead: 1, day: 1 }),
        accountId: account.id,
        categoryId: global.DEFAULT_CATEGORY_ID,
        expectedAmount: 10,
        expectedCurrencyCode: global.BASE_CURRENCY.code,
        raw: true,
      });

      const detail = await helpers.getSubscriptionById({ id: sub.id, raw: true });
      const upcoming = detail.periods.find((p) => p.status === SUBSCRIPTION_PERIOD_STATUSES.upcoming);

      const period = await helpers.markSubscriptionPeriodPaid({
        id: sub.id,
        periodId: upcoming!.id,
        transactionId: existingTx!.id,
        raw: true,
      });

      expect(period.status).toBe(SUBSCRIPTION_PERIOD_STATUSES.paid);
      expect(period.transactionId).toBe(existingTx!.id);
      // Link-mode never sets the auto-created flag.
      expect(period.transactionAutoCreated).toBe(false);
    });
  });

  describe('Variable bill (no expectedAmount)', () => {
    it('rejects create-mode when no expectedAmount and no override is given', async () => {
      const account = await helpers.createAccount({ raw: true });
      const sub = await helpers.createSubscription({
        name: 'Gas Bill',
        type: SUBSCRIPTION_TYPES.bill,
        frequency: SUBSCRIPTION_FREQUENCIES.monthly,
        startDate: futureDate({ monthsAhead: 1, day: 1 }),
        dueDate: futureDate({ monthsAhead: 1, day: 1 }),
        accountId: account.id,
        // no expectedAmount — variable amount bill
        raw: true,
      });

      const detail = await helpers.getSubscriptionById({ id: sub.id, raw: true });
      const upcoming = detail.periods.find((p) => p.status === SUBSCRIPTION_PERIOD_STATUSES.upcoming);

      const res = await helpers.markSubscriptionPeriodPaid({
        id: sub.id,
        periodId: upcoming!.id,
        createTransaction: true,
        raw: false,
      });
      expect(res.statusCode).toBe(422);

      // Period remains unpaid.
      const afterDetail = await helpers.getSubscriptionById({ id: sub.id, raw: true });
      const afterPeriod = afterDetail.periods.find((p) => p.id === upcoming!.id);
      expect(afterPeriod!.status).not.toBe(SUBSCRIPTION_PERIOD_STATUSES.paid);
    });

    it('succeeds when a variable-amount bill is paid with an explicit override', async () => {
      const account = await helpers.createAccount({ raw: true });
      const sub = await helpers.createSubscription({
        name: 'Water Bill',
        type: SUBSCRIPTION_TYPES.bill,
        frequency: SUBSCRIPTION_FREQUENCIES.monthly,
        startDate: futureDate({ monthsAhead: 1, day: 1 }),
        dueDate: futureDate({ monthsAhead: 1, day: 1 }),
        accountId: account.id,
        raw: true,
      });

      const detail = await helpers.getSubscriptionById({ id: sub.id, raw: true });
      const upcoming = detail.periods.find((p) => p.status === SUBSCRIPTION_PERIOD_STATUSES.upcoming);

      const period = await helpers.markSubscriptionPeriodPaid({
        id: sub.id,
        periodId: upcoming!.id,
        createTransaction: true,
        amount: 50,
        raw: true,
      });

      expect(period.status).toBe(SUBSCRIPTION_PERIOD_STATUSES.paid);
      const tx = await helpers.getTransactionById({ id: period.transactionId!, raw: true });
      expect(tx!.amount).toBe(50);
    });
  });

  describe('Error cases', () => {
    it('returns 409 when trying to pay an already-paid period', async () => {
      const account = await helpers.createAccount({ raw: true });
      const sub = await helpers.createSubscription({
        name: 'Spotify',
        frequency: SUBSCRIPTION_FREQUENCIES.monthly,
        startDate: futureDate({ monthsAhead: 1, day: 1 }),
        dueDate: futureDate({ monthsAhead: 1, day: 1 }),
        accountId: account.id,
        expectedAmount: 10,
        expectedCurrencyCode: global.BASE_CURRENCY.code,
        raw: true,
      });

      const detail = await helpers.getSubscriptionById({ id: sub.id, raw: true });
      const upcoming = detail.periods.find((p) => p.status === SUBSCRIPTION_PERIOD_STATUSES.upcoming);

      // First pay succeeds.
      await helpers.markSubscriptionPeriodPaid({ id: sub.id, periodId: upcoming!.id, raw: true });

      // Second pay must conflict.
      const res = await helpers.markSubscriptionPeriodPaid({
        id: sub.id,
        periodId: upcoming!.id,
        raw: false,
      });
      expect(res.statusCode).toBe(409);
    });

    it('returns a validation error when createTransaction and transactionId are both supplied', async () => {
      const account = await helpers.createAccount({ raw: true });
      const [tx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({ accountId: account.id }),
        raw: true,
      });
      const sub = await helpers.createSubscription({
        name: 'Apple One',
        frequency: SUBSCRIPTION_FREQUENCIES.monthly,
        startDate: futureDate({ monthsAhead: 1, day: 1 }),
        dueDate: futureDate({ monthsAhead: 1, day: 1 }),
        accountId: account.id,
        expectedAmount: 10,
        expectedCurrencyCode: global.BASE_CURRENCY.code,
        raw: true,
      });

      const detail = await helpers.getSubscriptionById({ id: sub.id, raw: true });
      const upcoming = detail.periods.find((p) => p.status === SUBSCRIPTION_PERIOD_STATUSES.upcoming);

      const res = await helpers.markSubscriptionPeriodPaid({
        id: sub.id,
        periodId: upcoming!.id,
        createTransaction: true,
        transactionId: tx!.id,
        raw: false,
      });
      expect(res.statusCode).toBe(422);
    });

    it('returns an error when createTransaction is true but the subscription has no account', async () => {
      const sub = await helpers.createSubscription({
        name: 'No Account Sub',
        type: SUBSCRIPTION_TYPES.subscription,
        frequency: SUBSCRIPTION_FREQUENCIES.monthly,
        startDate: futureDate({ monthsAhead: 1, day: 1 }),
        dueDate: futureDate({ monthsAhead: 1, day: 1 }),
        expectedAmount: 10,
        expectedCurrencyCode: global.BASE_CURRENCY.code,
        // no accountId
        raw: true,
      });

      const detail = await helpers.getSubscriptionById({ id: sub.id, raw: true });
      const upcoming = detail.periods.find((p) => p.status === SUBSCRIPTION_PERIOD_STATUSES.upcoming);

      const res = await helpers.markSubscriptionPeriodPaid({
        id: sub.id,
        periodId: upcoming!.id,
        createTransaction: true,
        raw: false,
      });
      expect(res.statusCode).toBe(422);
    });

    it('rejects linking the same transaction to a period of a different subscription (422)', async () => {
      const account = await helpers.createAccount({ raw: true });
      const [sharedTx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({ accountId: account.id }),
        raw: true,
      });

      const makeSub = (name: string) =>
        helpers.createSubscription({
          name,
          frequency: SUBSCRIPTION_FREQUENCIES.monthly,
          startDate: futureDate({ monthsAhead: 1, day: 1 }),
          dueDate: futureDate({ monthsAhead: 1, day: 1 }),
          accountId: account.id,
          expectedAmount: 10,
          expectedCurrencyCode: global.BASE_CURRENCY.code,
          raw: true,
        });

      const sub1 = await makeSub('Sub One');
      const sub2 = await makeSub('Sub Two');

      const detail1 = await helpers.getSubscriptionById({ id: sub1.id, raw: true });
      const upcoming1 = detail1.periods.find((p) => p.status === SUBSCRIPTION_PERIOD_STATUSES.upcoming);
      const detail2 = await helpers.getSubscriptionById({ id: sub2.id, raw: true });
      const upcoming2 = detail2.periods.find((p) => p.status === SUBSCRIPTION_PERIOD_STATUSES.upcoming);

      // Link the transaction to a period of the first subscription.
      const paid1 = await helpers.markSubscriptionPeriodPaid({
        id: sub1.id,
        periodId: upcoming1!.id,
        transactionId: sharedTx!.id,
        raw: true,
      });
      expect(paid1.transactionId).toBe(sharedTx!.id);

      // Re-using it on a period of the second subscription must be rejected.
      const res = await helpers.markSubscriptionPeriodPaid({
        id: sub2.id,
        periodId: upcoming2!.id,
        transactionId: sharedTx!.id,
        raw: false,
      });
      expect(res.statusCode).toBe(422);

      // The second period stays unpaid and unlinked.
      const after2 = await helpers.getSubscriptionById({ id: sub2.id, raw: true });
      const afterPeriod2 = after2.periods.find((p) => p.id === upcoming2!.id);
      expect(afterPeriod2!.status).not.toBe(SUBSCRIPTION_PERIOD_STATUSES.paid);
      expect(afterPeriod2!.transactionId).toBeNull();
    });

    it('rejects linking the same transaction to two periods of the same subscription (422)', async () => {
      const account = await helpers.createAccount({ raw: true });
      const [sharedTx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({ accountId: account.id }),
        raw: true,
      });

      const sub = await helpers.createSubscription({
        name: 'Same Sub Double Link',
        frequency: SUBSCRIPTION_FREQUENCIES.monthly,
        startDate: futureDate({ monthsAhead: 1, day: 1 }),
        dueDate: futureDate({ monthsAhead: 1, day: 1 }),
        accountId: account.id,
        expectedAmount: 10,
        expectedCurrencyCode: global.BASE_CURRENCY.code,
        raw: true,
      });

      // Paying the first period generates the next upcoming one, giving two periods to link against.
      const detail = await helpers.getSubscriptionById({ id: sub.id, raw: true });
      const period1 = detail.periods.find((p) => p.status === SUBSCRIPTION_PERIOD_STATUSES.upcoming);

      await helpers.markSubscriptionPeriodPaid({
        id: sub.id,
        periodId: period1!.id,
        transactionId: sharedTx!.id,
        raw: true,
      });

      const afterFirst = await helpers.getSubscriptionById({ id: sub.id, raw: true });
      const period2 = afterFirst.periods.find((p) => p.status === SUBSCRIPTION_PERIOD_STATUSES.upcoming);
      expect(period2).toBeDefined();

      // Linking the same transaction to the second period must be rejected.
      const res = await helpers.markSubscriptionPeriodPaid({
        id: sub.id,
        periodId: period2!.id,
        transactionId: sharedTx!.id,
        raw: false,
      });
      expect(res.statusCode).toBe(422);
    });

    it('returns 409 when trying to pay a skipped period', async () => {
      const account = await helpers.createAccount({ raw: true });
      const sub = await helpers.createSubscription({
        name: 'Skipped Sub',
        frequency: SUBSCRIPTION_FREQUENCIES.monthly,
        startDate: futureDate({ monthsAhead: 1, day: 1 }),
        dueDate: futureDate({ monthsAhead: 1, day: 1 }),
        accountId: account.id,
        expectedAmount: 10,
        expectedCurrencyCode: global.BASE_CURRENCY.code,
        raw: true,
      });

      const detail = await helpers.getSubscriptionById({ id: sub.id, raw: true });
      const upcoming = detail.periods.find((p) => p.status === SUBSCRIPTION_PERIOD_STATUSES.upcoming);

      const skipped = await helpers.skipSubscriptionPeriod({ id: sub.id, periodId: upcoming!.id, raw: true });
      expect(skipped.status).toBe(SUBSCRIPTION_PERIOD_STATUSES.skipped);

      // Paying a skipped period must conflict (undo the skip first).
      const res = await helpers.markSubscriptionPeriodPaid({
        id: sub.id,
        periodId: upcoming!.id,
        raw: false,
      });
      expect(res.statusCode).toBe(409);
    });

    it('returns 404 when the periodId belongs to a different subscription', async () => {
      const account = await helpers.createAccount({ raw: true });

      const makeSub = (name: string) =>
        helpers.createSubscription({
          name,
          frequency: SUBSCRIPTION_FREQUENCIES.monthly,
          startDate: futureDate({ monthsAhead: 1, day: 1 }),
          dueDate: futureDate({ monthsAhead: 1, day: 1 }),
          accountId: account.id,
          expectedAmount: 10,
          expectedCurrencyCode: global.BASE_CURRENCY.code,
          raw: true,
        });

      const sub1 = await makeSub('Target Sub');
      const sub2 = await makeSub('Foreign Sub');

      const detail2 = await helpers.getSubscriptionById({ id: sub2.id, raw: true });
      const foreignPeriod = detail2.periods.find((p) => p.status === SUBSCRIPTION_PERIOD_STATUSES.upcoming);

      // sub1 does not own foreignPeriod → not found.
      const res = await helpers.markSubscriptionPeriodPaid({
        id: sub1.id,
        periodId: foreignPeriod!.id,
        raw: false,
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('Paid date (backdated payment)', () => {
    it('stamps paidAt with the supplied past time, not today', async () => {
      const account = await helpers.createAccount({ raw: true });
      const sub = await helpers.createSubscription({
        name: 'Backdated Sub',
        frequency: SUBSCRIPTION_FREQUENCIES.monthly,
        startDate: futureDate({ monthsAhead: 1, day: 1 }),
        dueDate: futureDate({ monthsAhead: 1, day: 1 }),
        accountId: account.id,
        expectedAmount: 10,
        expectedCurrencyCode: global.BASE_CURRENCY.code,
        raw: true,
      });

      const detail = await helpers.getSubscriptionById({ id: sub.id, raw: true });
      const upcoming = detail.periods.find((p) => p.status === SUBSCRIPTION_PERIOD_STATUSES.upcoming);

      // A fixed past date, two months back, independent of the scheduler.
      const pastDate = futureDate({ monthsAhead: -2, day: 14 });
      const today = format(new Date(), 'yyyy-MM-dd');
      expect(pastDate).not.toBe(today);

      const period = await helpers.markSubscriptionPeriodPaid({
        id: sub.id,
        periodId: upcoming!.id,
        createTransaction: true,
        time: pastDate,
        raw: true,
      });

      expect(period.status).toBe(SUBSCRIPTION_PERIOD_STATUSES.paid);
      // paidAt falls on the supplied past date, not today.
      const paidAtDate = format(new Date(period.paidAt!), 'yyyy-MM-dd');
      expect(paidAtDate).toBe(pastDate);
      expect(paidAtDate).not.toBe(today);

      // And it matches the booked transaction's date.
      const tx = await helpers.getTransactionById({ id: period.transactionId!, raw: true });
      const txDate = format(new Date(tx!.time), 'yyyy-MM-dd');
      expect(txDate).toBe(pastDate);
    });
  });
});

describe('GET /subscriptions/:id/pay-preview', () => {
  describe('Same-currency subscription', () => {
    it('returns isCrossCurrency false and convertedAmount equals expectedAmount', async () => {
      const account = await helpers.createAccount({ raw: true });
      const sub = await helpers.createSubscription({
        name: 'iCloud',
        frequency: SUBSCRIPTION_FREQUENCIES.monthly,
        startDate: futureDate({ monthsAhead: 1, day: 1 }),
        dueDate: futureDate({ monthsAhead: 1, day: 1 }),
        accountId: account.id,
        // 2000 cents = $20.00; account is in base currency (same as sub)
        expectedAmount: 20,
        expectedCurrencyCode: global.BASE_CURRENCY.code,
        raw: true,
      });

      const preview = await helpers.getSubscriptionPayPreview({ id: sub.id, raw: true });

      expect(preview.isCrossCurrency).toBe(false);
      expect(preview.accountCurrencyCode).toBe(global.BASE_CURRENCY.code);
      expect(preview.expectedAmount).toBe(20);
      // Same currency: no conversion, convertedAmount equals expectedAmount.
      expect(preview.convertedAmount).toBe(20);
    });
  });

  describe('No-account subscription', () => {
    it('returns accountCurrencyCode null and convertedAmount null', async () => {
      const sub = await helpers.createSubscription({
        name: 'No Account Preview',
        type: SUBSCRIPTION_TYPES.subscription,
        frequency: SUBSCRIPTION_FREQUENCIES.monthly,
        startDate: futureDate({ monthsAhead: 1, day: 1 }),
        dueDate: futureDate({ monthsAhead: 1, day: 1 }),
        // 500 cents = $5.00
        expectedAmount: 5,
        expectedCurrencyCode: global.BASE_CURRENCY.code,
        // no accountId
        raw: true,
      });

      const preview = await helpers.getSubscriptionPayPreview({ id: sub.id, raw: true });

      expect(preview.accountCurrencyCode).toBeNull();
      expect(preview.convertedAmount).toBeNull();
      expect(preview.expectedAmount).toBe(5);
    });
  });

  describe('Variable bill with an account', () => {
    it('returns convertedAmount null and isCrossCurrency false when the bill has an account but no expectedAmount', async () => {
      // Account in the base currency so same-currency keeps isCrossCurrency false;
      // the missing expectedAmount is what makes convertedAmount null.
      const account = await helpers.createAccount({ raw: true });
      const sub = await helpers.createSubscription({
        name: 'Variable Bill Preview',
        type: SUBSCRIPTION_TYPES.bill,
        frequency: SUBSCRIPTION_FREQUENCIES.monthly,
        startDate: futureDate({ monthsAhead: 1, day: 1 }),
        dueDate: futureDate({ monthsAhead: 1, day: 1 }),
        accountId: account.id,
        // no expectedAmount — variable-amount bill
        raw: true,
      });

      const preview = await helpers.getSubscriptionPayPreview({ id: sub.id, raw: true });

      expect(preview.accountCurrencyCode).toBe(global.BASE_CURRENCY.code);
      expect(preview.isCrossCurrency).toBe(false);
      expect(preview.expectedAmount).toBeNull();
      // Nothing to convert without an expectedAmount.
      expect(preview.convertedAmount).toBeNull();
    });
  });
});
