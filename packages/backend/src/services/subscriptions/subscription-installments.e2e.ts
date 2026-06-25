import { SUBSCRIPTION_FREQUENCIES, SUBSCRIPTION_PERIOD_STATUSES, SUBSCRIPTION_TYPES } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import * as helpers from '@tests/helpers';
import { addMonths, format, subDays } from 'date-fns';

/** Returns a date string N months from today. */
function futureDate({ monthsAhead }: { monthsAhead: number }): string {
  return format(addMonths(new Date(), monthsAhead), 'yyyy-MM-dd');
}

/** Returns a date string N days before today. */
function pastDate({ daysAgo }: { daysAgo: number }): string {
  return format(subDays(new Date(), daysAgo), 'yyyy-MM-dd');
}

/**
 * Creates an installment with an account + amount so mark-paid (create-mode)
 * works. The schedule (dueDate) and payment count (maxOccurrences) are required
 * for the installment type.
 */
async function createInstallment({
  maxOccurrences,
  monthsAhead = 1,
}: {
  maxOccurrences: number;
  monthsAhead?: number;
}) {
  const account = await helpers.createAccount({ raw: true });
  const sub = await helpers.createSubscription({
    name: 'Monitor plan',
    type: SUBSCRIPTION_TYPES.installment,
    frequency: SUBSCRIPTION_FREQUENCIES.monthly,
    startDate: futureDate({ monthsAhead }),
    dueDate: futureDate({ monthsAhead }),
    accountId: account.id,
    categoryId: global.DEFAULT_CATEGORY_ID,
    expectedAmount: 10,
    expectedCurrencyCode: global.BASE_CURRENCY.code,
    maxOccurrences,
    raw: true,
  });
  return { account, sub };
}

/**
 * Creates a monthly subscription with an account and expected amount so
 * mark-paid (create-mode) works without extra wiring.
 */
async function createCappedSubscription({ maxOccurrences }: { maxOccurrences: number | null }) {
  const account = await helpers.createAccount({ raw: true });
  const sub = await helpers.createSubscription({
    name: 'Capped Sub',
    frequency: SUBSCRIPTION_FREQUENCIES.monthly,
    startDate: futureDate({ monthsAhead: 1 }),
    dueDate: futureDate({ monthsAhead: 1 }),
    accountId: account.id,
    categoryId: global.DEFAULT_CATEGORY_ID,
    expectedAmount: 10,
    expectedCurrencyCode: global.BASE_CURRENCY.code,
    maxOccurrences,
    raw: true,
  });
  return { account, sub };
}

/** Returns the first upcoming period for the given subscription id. */
async function getUpcomingPeriod({ subId }: { subId: string }) {
  const detail = await helpers.getSubscriptionById({ id: subId, raw: true });
  return detail.periods.find((p) => p.status === SUBSCRIPTION_PERIOD_STATUSES.upcoming) ?? null;
}

describe('Subscription installment cap (maxOccurrences)', () => {
  describe('Cap stops generation — pay path', () => {
    it('stops creating periods after maxOccurrences is reached via pay', async () => {
      const { sub } = await createCappedSubscription({ maxOccurrences: 2 });

      // Starts with 1 upcoming period (the seed period created on subscription creation).
      const period1 = await getUpcomingPeriod({ subId: sub.id });
      expect(period1).not.toBeNull();

      // Pay period 1 → period 2 is generated (cap not yet hit: 1 paid < 2).
      await helpers.markSubscriptionPeriodPaid({
        id: sub.id,
        periodId: period1!.id,
        createTransaction: true,
        raw: true,
      });

      const period2 = await getUpcomingPeriod({ subId: sub.id });
      expect(period2).not.toBeNull();

      // Pay period 2 → cap is now hit (2 total periods). No 3rd period should be generated.
      await helpers.markSubscriptionPeriodPaid({
        id: sub.id,
        periodId: period2!.id,
        createTransaction: true,
        raw: true,
      });

      const period3 = await getUpcomingPeriod({ subId: sub.id });
      expect(period3).toBeNull();

      // Confirm total period count via GET /:id/periods.
      const periodsPage = await helpers.getSubscriptionPeriods({ id: sub.id, raw: true });
      expect(periodsPage.total).toBe(2);
      expect(periodsPage.periods.every((p) => p.status !== SUBSCRIPTION_PERIOD_STATUSES.upcoming)).toBe(true);
    });
  });

  describe('Cap stops generation — skip path', () => {
    it('counts skipped periods toward the cap so skipping does not extend the schedule', async () => {
      const { sub } = await createCappedSubscription({ maxOccurrences: 2 });

      const period1 = await getUpcomingPeriod({ subId: sub.id });
      expect(period1).not.toBeNull();

      // Skip period 1 → period 2 is generated (1 total period < 2 cap).
      await helpers.skipSubscriptionPeriod({ id: sub.id, periodId: period1!.id, raw: true });

      const period2 = await getUpcomingPeriod({ subId: sub.id });
      expect(period2).not.toBeNull();

      // Skip period 2 → cap hit (2 total). No period 3.
      await helpers.skipSubscriptionPeriod({ id: sub.id, periodId: period2!.id, raw: true });

      const period3 = await getUpcomingPeriod({ subId: sub.id });
      expect(period3).toBeNull();

      const periodsPage = await helpers.getSubscriptionPeriods({ id: sub.id, raw: true });
      expect(periodsPage.total).toBe(2);
    });
  });

  describe('Cap does NOT pause the subscription', () => {
    it('leaves isActive true after all installments are consumed', async () => {
      const { sub } = await createCappedSubscription({ maxOccurrences: 1 });

      const period1 = await getUpcomingPeriod({ subId: sub.id });
      expect(period1).not.toBeNull();

      // Pay the single allowed period — cap is hit immediately after.
      await helpers.markSubscriptionPeriodPaid({
        id: sub.id,
        periodId: period1!.id,
        createTransaction: true,
        raw: true,
      });

      // isActive must still be true; the cap only stops generation, never pauses.
      const detail = await helpers.getSubscriptionById({ id: sub.id, raw: true });
      expect(detail.isActive).toBe(true);
    });
  });

  describe('Uncapped subscription keeps generating periods', () => {
    it('continues creating upcoming periods when maxOccurrences is null', async () => {
      const { sub } = await createCappedSubscription({ maxOccurrences: null });

      const period1 = await getUpcomingPeriod({ subId: sub.id });
      expect(period1).not.toBeNull();

      // Pay period 1 → period 2 generated.
      await helpers.markSubscriptionPeriodPaid({
        id: sub.id,
        periodId: period1!.id,
        createTransaction: true,
        raw: true,
      });

      const period2 = await getUpcomingPeriod({ subId: sub.id });
      expect(period2).not.toBeNull();

      // Pay period 2 → period 3 generated (generation is indefinite).
      await helpers.markSubscriptionPeriodPaid({
        id: sub.id,
        periodId: period2!.id,
        createTransaction: true,
        raw: true,
      });

      const period3 = await getUpcomingPeriod({ subId: sub.id });
      expect(period3).not.toBeNull();
    });
  });
});

describe('Installment completion (type=installment)', () => {
  it('marks the installment completed and deactivated once every payment is made', async () => {
    const { sub } = await createInstallment({ maxOccurrences: 2 });

    const period1 = await getUpcomingPeriod({ subId: sub.id });
    expect(period1).not.toBeNull();

    await helpers.markSubscriptionPeriodPaid({ id: sub.id, periodId: period1!.id, createTransaction: true, raw: true });

    // Still active and not yet completed after the first of two payments.
    const afterFirst = await helpers.getSubscriptionById({ id: sub.id, raw: true });
    expect(afterFirst.isActive).toBe(true);
    expect(afterFirst.completedAt).toBeNull();

    const period2 = await getUpcomingPeriod({ subId: sub.id });
    expect(period2).not.toBeNull();

    await helpers.markSubscriptionPeriodPaid({ id: sub.id, periodId: period2!.id, createTransaction: true, raw: true });

    // The final payment consumes the schedule → completed + deactivated.
    const afterFinal = await helpers.getSubscriptionById({ id: sub.id, raw: true });
    expect(afterFinal.isActive).toBe(false);
    expect(afterFinal.completedAt).not.toBeNull();
  });

  it('also completes when the final period is skipped rather than paid', async () => {
    const { sub } = await createInstallment({ maxOccurrences: 1 });

    const period1 = await getUpcomingPeriod({ subId: sub.id });
    expect(period1).not.toBeNull();

    await helpers.skipSubscriptionPeriod({ id: sub.id, periodId: period1!.id, raw: true });

    const detail = await helpers.getSubscriptionById({ id: sub.id, raw: true });
    expect(detail.isActive).toBe(false);
    expect(detail.completedAt).not.toBeNull();
  });

  it('does NOT complete or deactivate a capped non-installment subscription', async () => {
    // createCappedSubscription uses the default type (subscription).
    const { sub } = await createCappedSubscription({ maxOccurrences: 1 });

    const period1 = await getUpcomingPeriod({ subId: sub.id });
    await helpers.markSubscriptionPeriodPaid({ id: sub.id, periodId: period1!.id, createTransaction: true, raw: true });

    const detail = await helpers.getSubscriptionById({ id: sub.id, raw: true });
    expect(detail.isActive).toBe(true);
    expect(detail.completedAt).toBeNull();
  });

  it('reopens and reactivates a completed installment when the final payment is reverted', async () => {
    const { sub } = await createInstallment({ maxOccurrences: 1 });

    const period1 = await getUpcomingPeriod({ subId: sub.id });
    await helpers.markSubscriptionPeriodPaid({ id: sub.id, periodId: period1!.id, createTransaction: true, raw: true });

    const completed = await helpers.getSubscriptionById({ id: sub.id, raw: true });
    expect(completed.completedAt).not.toBeNull();

    await helpers.revertSubscriptionPeriod({ id: sub.id, periodId: period1!.id, raw: true });

    const reopened = await helpers.getSubscriptionById({ id: sub.id, raw: true });
    expect(reopened.isActive).toBe(true);
    expect(reopened.completedAt).toBeNull();
    // The reverted period is open again (upcoming or overdue, by its due date).
    const openAgain = reopened.periods.find(
      (p) => p.status === SUBSCRIPTION_PERIOD_STATUSES.upcoming || p.status === SUBSCRIPTION_PERIOD_STATUSES.overdue,
    );
    expect(openAgain).toBeDefined();
  });
});

describe('Installment validation (count + schedule required)', () => {
  it('rejects an installment without a payment count (maxOccurrences)', async () => {
    const account = await helpers.createAccount({ raw: true });
    const res = await helpers.createSubscription({
      name: 'No count plan',
      type: SUBSCRIPTION_TYPES.installment,
      frequency: SUBSCRIPTION_FREQUENCIES.monthly,
      startDate: futureDate({ monthsAhead: 1 }),
      dueDate: futureDate({ monthsAhead: 1 }),
      accountId: account.id,
      categoryId: global.DEFAULT_CATEGORY_ID,
      expectedAmount: 10,
      expectedCurrencyCode: global.BASE_CURRENCY.code,
      raw: false,
    });

    expect(res.statusCode).toBe(ERROR_CODES.ValidationError);
  });

  it('rejects an installment without a payment schedule date (dueDate)', async () => {
    const account = await helpers.createAccount({ raw: true });
    const res = await helpers.createSubscription({
      name: 'No schedule plan',
      type: SUBSCRIPTION_TYPES.installment,
      frequency: SUBSCRIPTION_FREQUENCIES.monthly,
      startDate: futureDate({ monthsAhead: 1 }),
      accountId: account.id,
      categoryId: global.DEFAULT_CATEGORY_ID,
      expectedAmount: 10,
      expectedCurrencyCode: global.BASE_CURRENCY.code,
      maxOccurrences: 6,
      raw: false,
    });

    expect(res.statusCode).toBe(ERROR_CODES.ValidationError);
  });
});

describe('Editing a completed installment', () => {
  it('un-completes, reactivates, and continues the schedule without duplicating a period when the cap is raised', async () => {
    // A 1-payment installment with a past due date: marking it paid completes it.
    const account = await helpers.createAccount({ raw: true });
    const sub = await helpers.createSubscription({
      name: 'Monitor',
      type: SUBSCRIPTION_TYPES.installment,
      frequency: SUBSCRIPTION_FREQUENCIES.monthly,
      startDate: pastDate({ daysAgo: 1 }),
      dueDate: pastDate({ daysAgo: 1 }),
      accountId: account.id,
      categoryId: global.DEFAULT_CATEGORY_ID,
      expectedAmount: 10,
      expectedCurrencyCode: global.BASE_CURRENCY.code,
      maxOccurrences: 1,
      raw: true,
    });

    const seed = await helpers.getSubscriptionById({ id: sub.id, raw: true });
    expect(seed.periods).toHaveLength(1);
    const dueDate = seed.periods[0]!.dueDate;

    await helpers.markSubscriptionPeriodPaid({
      id: sub.id,
      periodId: seed.periods[0]!.id,
      createTransaction: true,
      raw: true,
    });

    const completed = await helpers.getSubscriptionById({ id: sub.id, raw: true });
    expect(completed.completedAt).not.toBeNull();
    expect(completed.isActive).toBe(false);

    // Raise the cap to 3. The edit form re-sends the (unchanged) dueDate, which must
    // NOT duplicate the already-paid period, and the plan must un-complete + reactivate.
    await helpers.updateSubscription({
      id: sub.id,
      type: SUBSCRIPTION_TYPES.installment,
      maxOccurrences: 3,
      dueDate,
      raw: true,
    });

    const reopened = await helpers.getSubscriptionById({ id: sub.id, raw: true });
    expect(reopened.completedAt).toBeNull();
    expect(reopened.isActive).toBe(true);

    // Exactly one paid period and no duplicate at its dueDate.
    expect(reopened.periods.filter((p) => p.status === SUBSCRIPTION_PERIOD_STATUSES.paid)).toHaveLength(1);
    expect(reopened.periods.filter((p) => p.dueDate === dueDate)).toHaveLength(1);

    // The schedule continues with a single new open period at a later date.
    const openPeriods = reopened.periods.filter(
      (p) => p.status === SUBSCRIPTION_PERIOD_STATUSES.upcoming || p.status === SUBSCRIPTION_PERIOD_STATUSES.overdue,
    );
    expect(openPeriods).toHaveLength(1);
    expect(openPeriods[0]!.dueDate > dueDate).toBe(true);
  });
});

describe('Subscriptions list paid-period progress', () => {
  it('exposes paidPeriodsCount alongside maxOccurrences on the list', async () => {
    const { sub } = await createInstallment({ maxOccurrences: 3 });

    const period1 = await getUpcomingPeriod({ subId: sub.id });
    await helpers.markSubscriptionPeriodPaid({ id: sub.id, periodId: period1!.id, createTransaction: true, raw: true });

    const list = await helpers.getSubscriptions({ raw: true });
    const item = list.find((s) => s.id === sub.id);
    expect(item).toBeDefined();
    expect(item!.paidPeriodsCount).toBe(1);
    expect(item!.maxOccurrences).toBe(3);
  });
});

describe('Open period status reflects a past due date at creation', () => {
  it('creates an overdue seed period when the due date is already in the past', async () => {
    const account = await helpers.createAccount({ raw: true });
    const sub = await helpers.createSubscription({
      name: 'Past bill',
      type: SUBSCRIPTION_TYPES.bill,
      frequency: SUBSCRIPTION_FREQUENCIES.monthly,
      startDate: pastDate({ daysAgo: 40 }),
      dueDate: pastDate({ daysAgo: 1 }),
      accountId: account.id,
      categoryId: global.DEFAULT_CATEGORY_ID,
      raw: true,
    });

    const detail = await helpers.getSubscriptionById({ id: sub.id, raw: true });
    expect(detail.periods).toHaveLength(1);
    expect(detail.periods[0]!.status).toBe(SUBSCRIPTION_PERIOD_STATUSES.overdue);
  });
});
