import { SUBSCRIPTION_FREQUENCIES, SUBSCRIPTION_PERIOD_STATUSES } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import * as helpers from '@tests/helpers';
import { addMonths, format } from 'date-fns';

/** A dueDate comfortably in the future so its seed period stays `upcoming`. */
function futureDueDate(): string {
  return format(addMonths(new Date(), 1), 'yyyy-MM-dd');
}

describe('Subscription periods', () => {
  describe('Period created on subscription create', () => {
    it('creates one upcoming period when dueDate is provided', async () => {
      const dueDate = futureDueDate();
      const sub = await helpers.createSubscription({
        name: 'Netflix',
        expectedAmount: 15.99,
        expectedCurrencyCode: 'USD',
        frequency: SUBSCRIPTION_FREQUENCIES.monthly,
        startDate: '2025-01-01',
        dueDate,
        raw: true,
      });

      const detail = await helpers.getSubscriptionById({ id: sub.id, raw: true });

      expect(detail.periods).toHaveLength(1);
      expect(detail.periods[0]!.status).toBe(SUBSCRIPTION_PERIOD_STATUSES.upcoming);
      expect(detail.periods[0]!.dueDate).toBe(dueDate);
    });

    it('creates no periods when dueDate is omitted (detection-only subscription)', async () => {
      const sub = await helpers.createSubscription({
        name: 'Spotify',
        expectedAmount: 9.99,
        expectedCurrencyCode: 'USD',
        frequency: SUBSCRIPTION_FREQUENCIES.monthly,
        startDate: '2025-01-01',
        raw: true,
      });

      const detail = await helpers.getSubscriptionById({ id: sub.id, raw: true });

      expect(detail.periods).toHaveLength(0);
    });
  });

  describe('Period created on subscription update', () => {
    it('creates one upcoming period when dueDate is added via update', async () => {
      const dueDate = futureDueDate();
      // Start without dueDate so no period is created on creation
      const sub = await helpers.createSubscription({
        name: 'iCloud',
        expectedAmount: 2.99,
        expectedCurrencyCode: 'USD',
        frequency: SUBSCRIPTION_FREQUENCIES.monthly,
        startDate: '2025-02-01',
        raw: true,
      });

      const before = await helpers.getSubscriptionById({ id: sub.id, raw: true });
      expect(before.periods).toHaveLength(0);

      await helpers.updateSubscription({
        id: sub.id,
        dueDate,
        raw: true,
      });

      const after = await helpers.getSubscriptionById({ id: sub.id, raw: true });

      expect(after.periods).toHaveLength(1);
      expect(after.periods[0]!.status).toBe(SUBSCRIPTION_PERIOD_STATUSES.upcoming);
      expect(after.periods[0]!.dueDate).toBe(dueDate);
    });

    it('does not create a duplicate period when dueDate update is repeated', async () => {
      const sub = await helpers.createSubscription({
        name: 'Adobe CC',
        expectedAmount: 54.99,
        expectedCurrencyCode: 'USD',
        frequency: SUBSCRIPTION_FREQUENCIES.monthly,
        startDate: '2025-03-01',
        dueDate: '2025-03-20',
        raw: true,
      });

      // First update keeps the same dueDate — should not add a second period
      await helpers.updateSubscription({
        id: sub.id,
        dueDate: '2025-03-20',
        raw: true,
      });

      const detail = await helpers.getSubscriptionById({ id: sub.id, raw: true });
      expect(detail.periods).toHaveLength(1);
    });
  });

  describe('Subscription detail includes periods array', () => {
    it('periods array is always present on detail response', async () => {
      const sub = await helpers.createSubscription({
        name: 'GitHub',
        expectedAmount: 4,
        expectedCurrencyCode: 'USD',
        frequency: SUBSCRIPTION_FREQUENCIES.monthly,
        startDate: '2025-01-01',
        raw: true,
      });

      const detail = await helpers.getSubscriptionById({ id: sub.id, raw: true });

      expect(Array.isArray(detail.periods)).toBe(true);
    });
  });
});
