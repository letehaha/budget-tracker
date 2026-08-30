import { SUBSCRIPTION_FREQUENCIES, SUBSCRIPTION_TYPES } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import * as helpers from '@tests/helpers';

describe('GET /subscriptions/upcoming', () => {
  it('returns upcoming payments sorted by next payment date', async () => {
    await helpers.createSubscription({
      name: 'Weekly Sub',
      expectedAmount: 5,
      expectedCurrencyCode: 'USD',
      frequency: SUBSCRIPTION_FREQUENCIES.weekly,
      startDate: '2025-01-01',
      raw: true,
    });
    await helpers.createSubscription({
      name: 'Monthly Sub',
      expectedAmount: 15.99,
      expectedCurrencyCode: 'USD',
      frequency: SUBSCRIPTION_FREQUENCIES.monthly,
      startDate: '2025-01-15',
      raw: true,
    });
    await helpers.createSubscription({
      name: 'Annual Sub',
      expectedAmount: 99.99,
      expectedCurrencyCode: 'USD',
      frequency: SUBSCRIPTION_FREQUENCIES.annual,
      startDate: '2025-06-01',
      raw: true,
    });

    const result = await helpers.getUpcomingPayments({ raw: true });

    expect(result.length).toBe(3);

    // Verify sorted by nextPaymentDate ascending
    for (let i = 1; i < result.length; i++) {
      expect(result[i]!.nextPaymentDate! >= result[i - 1]!.nextPaymentDate!).toBe(true);
    }

    // Verify amounts are in decimal (not cents)
    const weeklySub = result.find((r) => r.subscriptionName === 'Weekly Sub');
    expect(weeklySub).toBeDefined();
    expect(weeklySub!.expectedAmount).toBe(5);

    const monthlySub = result.find((r) => r.subscriptionName === 'Monthly Sub');
    expect(monthlySub).toBeDefined();
    expect(monthlySub!.expectedAmount).toBe(15.99);

    // Verify shape
    expect(result[0]).toEqual(
      expect.objectContaining({
        subscriptionId: expect.any(String),
        subscriptionName: expect.any(String),
        expectedAmount: expect.any(Number),
        nextPaymentDate: expect.any(String),
        frequency: expect.any(String),
      }),
    );
  });

  it('returns empty array when no subscriptions exist', async () => {
    const result = await helpers.getUpcomingPayments({ raw: true });
    expect(result).toEqual([]);
  });

  it('excludes inactive subscriptions and subscriptions with null expectedAmount', async () => {
    const activeSub = await helpers.createSubscription({
      name: 'Active Sub',
      expectedAmount: 10,
      expectedCurrencyCode: 'USD',
      frequency: SUBSCRIPTION_FREQUENCIES.monthly,
      startDate: '2025-01-01',
      raw: true,
    });

    const inactiveSub = await helpers.createSubscription({
      name: 'Inactive Sub',
      expectedAmount: 20,
      expectedCurrencyCode: 'USD',
      frequency: SUBSCRIPTION_FREQUENCIES.monthly,
      startDate: '2025-01-01',
      raw: true,
    });

    await helpers.createSubscription({
      name: 'Without Amount',
      expectedAmount: null,
      frequency: SUBSCRIPTION_FREQUENCIES.monthly,
      startDate: '2025-01-01',
      raw: true,
    });

    await helpers.toggleSubscriptionActive({
      id: inactiveSub.id,
      isActive: false,
      raw: true,
    });

    const result = await helpers.getUpcomingPayments({ raw: true });

    const ids = result.map((r) => r.subscriptionId);
    expect(ids).toContain(activeSub.id);
    expect(ids).not.toContain(inactiveSub.id);

    const names = result.map((r) => r.subscriptionName);
    expect(names).not.toContain('Without Amount');
  });

  it('applies the explicit limit, the default limit of 5, and rejects an invalid limit', async () => {
    for (let i = 0; i < 7; i++) {
      await helpers.createSubscription({
        name: `Limit Sub ${i}`,
        expectedAmount: 10,
        expectedCurrencyCode: 'USD',
        frequency: SUBSCRIPTION_FREQUENCIES.monthly,
        startDate: '2025-01-01',
        raw: true,
      });
    }

    const limited = await helpers.getUpcomingPayments({ limit: 3, raw: true });
    expect(limited.length).toBe(3);

    const defaulted = await helpers.getUpcomingPayments({ raw: true });
    expect(defaulted.length).toBe(5);

    const invalid = await helpers.getUpcomingPayments({ limit: 0 });
    expect(invalid.statusCode).toBe(422);
  }, 60_000);

  it('filters by type and returns every type when no type is specified', async () => {
    await helpers.createSubscription({
      name: 'My Subscription',
      type: SUBSCRIPTION_TYPES.subscription,
      expectedAmount: 10,
      expectedCurrencyCode: 'USD',
      frequency: SUBSCRIPTION_FREQUENCIES.monthly,
      startDate: '2025-01-01',
      raw: true,
    });
    await helpers.createSubscription({
      name: 'My Bill',
      type: SUBSCRIPTION_TYPES.bill,
      expectedAmount: 20,
      expectedCurrencyCode: 'USD',
      frequency: SUBSCRIPTION_FREQUENCIES.monthly,
      startDate: '2025-01-01',
      raw: true,
    });

    const subscriptionsOnly = await helpers.getUpcomingPayments({
      type: SUBSCRIPTION_TYPES.subscription,
      raw: true,
    });
    expect(subscriptionsOnly.length).toBe(1);
    expect(subscriptionsOnly[0]!.subscriptionName).toBe('My Subscription');

    const billsOnly = await helpers.getUpcomingPayments({ type: SUBSCRIPTION_TYPES.bill, raw: true });
    expect(billsOnly.length).toBe(1);
    expect(billsOnly[0]!.subscriptionName).toBe('My Bill');

    const all = await helpers.getUpcomingPayments({ raw: true });
    expect(all.length).toBe(2);
    const names = all.map((r) => r.subscriptionName);
    expect(names).toContain('My Subscription');
    expect(names).toContain('My Bill');
  });

  it('includes category info when subscription has a category', async () => {
    const categories = await helpers.getCategoriesList();
    const category = categories[0]!;

    await helpers.createSubscription({
      name: 'Categorized Sub',
      expectedAmount: 9.99,
      expectedCurrencyCode: 'USD',
      frequency: SUBSCRIPTION_FREQUENCIES.monthly,
      startDate: '2025-01-01',
      categoryId: category.id,
      raw: true,
    });

    const result = await helpers.getUpcomingPayments({ raw: true });
    const sub = result.find((r) => r.subscriptionName === 'Categorized Sub');

    expect(sub).toBeDefined();
    expect(sub!.categoryName).toBe(category.name);
    expect(sub!.categoryColor).toBe(category.color);
  });
});
