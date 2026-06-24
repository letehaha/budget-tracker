import { SUBSCRIPTION_FREQUENCIES, SUBSCRIPTION_PERIOD_STATUSES } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import * as helpers from '@tests/helpers';
import { addMonths, format } from 'date-fns';

/** Returns a date string N months from today. */
function futureDate({ monthsAhead }: { monthsAhead: number }): string {
  return format(addMonths(new Date(), monthsAhead), 'yyyy-MM-dd');
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
