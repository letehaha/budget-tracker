import {
  SUBSCRIPTION_STATUSES,
  USER_ROLES,
  type BillingSubscriptionSummary,
  type Entitlements,
  type SubscriptionStatus,
} from '@bt/shared/types';
import { ADMIN_USER, DEMO_USER, USER } from '@tests/mocks';
import { addDays } from 'date-fns';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useUserStore } from './user';

const buildEntitlements = (overrides: Partial<Entitlements> = {}): Entitlements => ({
  features: [],
  readOnly: false,
  seats: 1,
  plan: null,
  trialEndsAt: null,
  subscriptions: [],
  ...overrides,
});

const buildSubscription = ({
  status,
  currentPeriodEndsAt = addDays(new Date(), 30).toISOString(),
}: {
  status: SubscriptionStatus;
  currentPeriodEndsAt?: string;
}): BillingSubscriptionSummary => ({
  externalSubscriptionId: `sub_${status}`,
  tier: 'plus',
  status,
  billingCycle: 'month',
  currentPeriodEndsAt,
  scheduledChange: null,
});

const userWith = (entitlements: Entitlements) => ({ ...USER, entitlements });

// Mock the API module
vi.mock('@/api', () => ({
  loadUserData: vi.fn(),
}));

describe('useUserStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  describe('isDemo computed property', () => {
    it('returns true when user has demo role', () => {
      const store = useUserStore();
      store.user = DEMO_USER;

      expect(store.isDemo).toBe(true);
    });

    it('returns false when user has common role', () => {
      const store = useUserStore();
      store.user = USER;

      expect(store.isDemo).toBe(false);
    });

    it('returns false when user has admin role', () => {
      const store = useUserStore();
      store.user = ADMIN_USER;

      expect(store.isDemo).toBe(false);
    });

    it('returns false when user is null', () => {
      const store = useUserStore();
      store.user = null;

      expect(store.isDemo).toBe(false);
    });
  });

  describe('role computed property', () => {
    it('returns demo role for demo user', () => {
      const store = useUserStore();
      store.user = DEMO_USER;

      expect(store.role).toBe(USER_ROLES.demo);
    });

    it('returns common role for regular user', () => {
      const store = useUserStore();
      store.user = USER;

      expect(store.role).toBe(USER_ROLES.common);
    });

    it('returns admin role for admin user', () => {
      const store = useUserStore();
      store.user = ADMIN_USER;

      expect(store.role).toBe(USER_ROLES.admin);
    });

    it('returns null when user is null', () => {
      const store = useUserStore();
      store.user = null;

      expect(store.role).toBe(null);
    });
  });

  describe('isUserExists computed property', () => {
    it('returns true when user exists', () => {
      const store = useUserStore();
      store.user = USER;

      expect(store.isUserExists).toBe(true);
    });

    it('returns false when user is null', () => {
      const store = useUserStore();
      store.user = null;

      expect(store.isUserExists).toBe(false);
    });
  });

  describe('trialDaysLeft', () => {
    it('counts the days until the trial ends', () => {
      const store = useUserStore();
      store.user = userWith(
        buildEntitlements({
          trialEndsAt: addDays(new Date(), 5).toISOString(),
        }),
      );

      expect(store.trialDaysLeft).toBe(5);
    });

    it('returns 0 once the trial end date has passed', () => {
      const store = useUserStore();
      store.user = userWith(
        buildEntitlements({
          trialEndsAt: addDays(new Date(), -3).toISOString(),
        }),
      );

      expect(store.trialDaysLeft).toBe(0);
    });

    it('returns null when no trial is running', () => {
      const store = useUserStore();
      store.user = userWith(buildEntitlements());

      expect(store.trialDaysLeft).toBe(null);
    });

    it('returns null for a lifetime plan even while the trial date stands', () => {
      const store = useUserStore();
      store.user = userWith(
        buildEntitlements({
          trialEndsAt: addDays(new Date(), 5).toISOString(),
          plan: 'early_adopter',
        }),
      );

      expect(store.trialDaysLeft).toBe(null);
    });

    it('returns null once a live subscription exists', () => {
      const store = useUserStore();
      store.user = userWith(
        buildEntitlements({
          trialEndsAt: addDays(new Date(), 5).toISOString(),
          subscriptions: [buildSubscription({ status: SUBSCRIPTION_STATUSES.active })],
        }),
      );

      expect(store.trialDaysLeft).toBe(null);
    });

    it('still counts the trial when every subscription is canceled', () => {
      const store = useUserStore();
      store.user = userWith(
        buildEntitlements({
          trialEndsAt: addDays(new Date(), 5).toISOString(),
          subscriptions: [buildSubscription({ status: SUBSCRIPTION_STATUSES.canceled })],
        }),
      );

      expect(store.trialDaysLeft).toBe(5);
    });

    it('suppresses the trial for a paused subscription, which is not terminal', () => {
      const store = useUserStore();
      store.user = userWith(
        buildEntitlements({
          trialEndsAt: addDays(new Date(), 5).toISOString(),
          subscriptions: [buildSubscription({ status: SUBSCRIPTION_STATUSES.paused })],
        }),
      );

      expect(store.trialDaysLeft).toBe(null);
    });
  });

  describe('isPastDue', () => {
    it('is true for a past-due subscription whose paid period has not elapsed', () => {
      const store = useUserStore();
      store.user = userWith(
        buildEntitlements({
          subscriptions: [buildSubscription({ status: SUBSCRIPTION_STATUSES.past_due })],
        }),
      );

      expect(store.isPastDue).toBe(true);
    });

    it('is false once the past-due period has elapsed, since the row no longer grants access', () => {
      const store = useUserStore();
      store.user = userWith(
        buildEntitlements({
          subscriptions: [
            buildSubscription({
              status: SUBSCRIPTION_STATUSES.past_due,
              currentPeriodEndsAt: addDays(new Date(), -1).toISOString(),
            }),
          ],
        }),
      );

      expect(store.isPastDue).toBe(false);
    });

    it('is false for an active subscription', () => {
      const store = useUserStore();
      store.user = userWith(
        buildEntitlements({
          subscriptions: [buildSubscription({ status: SUBSCRIPTION_STATUSES.active })],
        }),
      );

      expect(store.isPastDue).toBe(false);
    });
  });
});
