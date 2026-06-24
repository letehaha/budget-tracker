import { REMIND_BEFORE_PRESETS, SUBSCRIPTION_FREQUENCIES } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import * as helpers from '@tests/helpers';

describe('Subscription notification settings', () => {
  describe('create', () => {
    it('persists remindBefore and notifyEmail when provided', async () => {
      const created = await helpers.createSubscription({
        name: 'With Reminders',
        expectedAmount: 9.99,
        expectedCurrencyCode: 'USD',
        frequency: SUBSCRIPTION_FREQUENCIES.monthly,
        startDate: '2025-01-01',
        remindBefore: [REMIND_BEFORE_PRESETS.oneDay, REMIND_BEFORE_PRESETS.oneWeek],
        notifyEmail: true,
        raw: true,
      });

      const detail = await helpers.getSubscriptionById({ id: created.id, raw: true });
      expect(detail.remindBefore).toEqual([REMIND_BEFORE_PRESETS.oneDay, REMIND_BEFORE_PRESETS.oneWeek]);
      expect(detail.notifyEmail).toBe(true);
    });

    it('defaults to an empty remindBefore array and notifyEmail false when omitted', async () => {
      const created = await helpers.createSubscription({
        name: 'No Reminders',
        expectedAmount: 9.99,
        expectedCurrencyCode: 'USD',
        frequency: SUBSCRIPTION_FREQUENCIES.monthly,
        startDate: '2025-01-01',
        raw: true,
      });

      const detail = await helpers.getSubscriptionById({ id: created.id, raw: true });
      expect(detail.remindBefore).toEqual([]);
      expect(detail.notifyEmail).toBe(false);
    });

    it('rejects an invalid remindBefore preset and persists nothing', async () => {
      const res = await helpers.createSubscription({
        name: 'Invalid Preset',
        expectedAmount: 9.99,
        expectedCurrencyCode: 'USD',
        frequency: SUBSCRIPTION_FREQUENCIES.monthly,
        startDate: '2025-01-01',
        // Cast through unknown so the bad value reaches the endpoint for validation
        remindBefore: ['nonsense'] as unknown as (typeof REMIND_BEFORE_PRESETS)[keyof typeof REMIND_BEFORE_PRESETS][],
      });

      expect(res.statusCode).toBe(422);

      const list = await helpers.getSubscriptions({ raw: true });
      expect(list.some((s: { name: string }) => s.name === 'Invalid Preset')).toBe(false);
    });
  });

  describe('update', () => {
    it('sets remindBefore and notifyEmail on an existing subscription', async () => {
      const sub = await helpers.createSubscription({
        name: 'Update Target',
        expectedAmount: 9.99,
        expectedCurrencyCode: 'USD',
        frequency: SUBSCRIPTION_FREQUENCIES.monthly,
        startDate: '2025-01-01',
        raw: true,
      });

      await helpers.updateSubscription({
        id: sub.id,
        remindBefore: [REMIND_BEFORE_PRESETS.threeDays],
        notifyEmail: true,
        raw: true,
      });

      const detail = await helpers.getSubscriptionById({ id: sub.id, raw: true });
      expect(detail.remindBefore).toEqual([REMIND_BEFORE_PRESETS.threeDays]);
      expect(detail.notifyEmail).toBe(true);
    });

    it('clears remindBefore when updated with an empty array', async () => {
      const sub = await helpers.createSubscription({
        name: 'Clear Reminders',
        expectedAmount: 9.99,
        expectedCurrencyCode: 'USD',
        frequency: SUBSCRIPTION_FREQUENCIES.monthly,
        startDate: '2025-01-01',
        remindBefore: [REMIND_BEFORE_PRESETS.oneWeek],
        notifyEmail: true,
        raw: true,
      });

      await helpers.updateSubscription({ id: sub.id, remindBefore: [], raw: true });

      const detail = await helpers.getSubscriptionById({ id: sub.id, raw: true });
      expect(detail.remindBefore).toEqual([]);
      // notifyEmail is untouched by a remindBefore-only update
      expect(detail.notifyEmail).toBe(true);
    });

    it('rejects an invalid remindBefore preset and leaves the subscription unchanged', async () => {
      const sub = await helpers.createSubscription({
        name: 'Reject Update',
        expectedAmount: 9.99,
        expectedCurrencyCode: 'USD',
        frequency: SUBSCRIPTION_FREQUENCIES.monthly,
        startDate: '2025-01-01',
        remindBefore: [REMIND_BEFORE_PRESETS.oneDay],
        notifyEmail: true,
        raw: true,
      });

      const res = await helpers.updateSubscription({
        id: sub.id,
        // Cast through unknown so the bad value reaches the endpoint for validation
        remindBefore: ['nonsense'] as unknown as (typeof REMIND_BEFORE_PRESETS)[keyof typeof REMIND_BEFORE_PRESETS][],
      });

      expect(res.statusCode).toBe(422);

      const detail = await helpers.getSubscriptionById({ id: sub.id, raw: true });
      expect(detail.remindBefore).toEqual([REMIND_BEFORE_PRESETS.oneDay]);
      expect(detail.notifyEmail).toBe(true);
    });
  });
});
