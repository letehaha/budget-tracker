import { SUBSCRIPTION_FREQUENCIES } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import * as helpers from '@tests/helpers';

describe('GET /subscriptions/upcoming', () => {
  it('returns upcoming payments sorted by next payment date', async () => {
    await helpers.createSubscription({
      name: 'Weekly Sub',
      expectedAmount: 500,
      expectedCurrencyCode: 'USD',
      frequency: SUBSCRIPTION_FREQUENCIES.weekly,
      startDate: '2025-01-01',
      raw: true,
    });
    await helpers.createSubscription({
      name: 'Monthly Sub',
      expectedAmount: 1599,
      expectedCurrencyCode: 'USD',
      frequency: SUBSCRIPTION_FREQUENCIES.monthly,
      startDate: '2025-01-15',
      raw: true,
    });
    await helpers.createSubscription({
      name: 'Annual Sub',
      expectedAmount: 9999,
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

  it('excludes inactive subscriptions', async () => {
    const activeSub = await helpers.createSubscription({
      name: 'Active Sub',
      expectedAmount: 1000,
      expectedCurrencyCode: 'USD',
      frequency: SUBSCRIPTION_FREQUENCIES.monthly,
      startDate: '2025-01-01',
      raw: true,
    });

    const inactiveSub = await helpers.createSubscription({
      name: 'Inactive Sub',
      expectedAmount: 2000,
      expectedCurrencyCode: 'USD',
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
  });

  it('excludes subscriptions with null expectedAmount', async () => {
    await helpers.createSubscription({
      name: 'With Amount',
      expectedAmount: 1500,
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

    const result = await helpers.getUpcomingPayments({ raw: true });

    const names = result.map((r) => r.subscriptionName);
    expect(names).toContain('With Amount');
    expect(names).not.toContain('Without Amount');
  });

  it('respects limit parameter', async () => {
    for (let i = 0; i < 10; i++) {
      await helpers.createSubscription({
        name: `Sub ${i}`,
        expectedAmount: 1000,
        expectedCurrencyCode: 'USD',
        frequency: SUBSCRIPTION_FREQUENCIES.monthly,
        startDate: '2025-01-01',
        raw: true,
      });
    }

    const result = await helpers.getUpcomingPayments({ limit: 3, raw: true });
    expect(result.length).toBe(3);
  });

  it('defaults to 5 results when limit is not provided', async () => {
    for (let i = 0; i < 7; i++) {
      await helpers.createSubscription({
        name: `Default Limit Sub ${i}`,
        expectedAmount: 1000,
        expectedCurrencyCode: 'USD',
        frequency: SUBSCRIPTION_FREQUENCIES.monthly,
        startDate: '2025-01-01',
        raw: true,
      });
    }

    const result = await helpers.getUpcomingPayments({ raw: true });
    expect(result.length).toBe(5);
  });

  it('returns 422 for invalid limit', async () => {
    const result = await helpers.getUpcomingPayments({ limit: 0 });
    expect(result.statusCode).toBe(422);
  });

  it('includes category info when subscription has a category', async () => {
    const categories = await helpers.getCategoriesList();
    const category = categories[0]!;

    await helpers.createSubscription({
      name: 'Categorized Sub',
      expectedAmount: 999,
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
