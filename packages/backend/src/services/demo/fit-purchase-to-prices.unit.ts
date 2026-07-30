import { describe, expect, it } from '@jest/globals';

import { fitPurchaseToPrices } from './fit-purchase-to-prices';

const point = ({ daysAgo, price }: { daysAgo: number; price: number }) => ({
  date: new Date(Date.UTC(2026, 0, 1) - daysAgo * 86_400_000),
  price,
});

const target = ({ daysAgo }: { daysAgo: number }) => new Date(Date.UTC(2026, 0, 1) - daysAgo * 86_400_000);

describe('fitPurchaseToPrices', () => {
  it('returns null when the security has no prices', () => {
    expect(fitPurchaseToPrices({ prices: [], targetDate: target({ daysAgo: 300 }) })).toBeNull();
  });

  it('returns the exact row when the target date has a price', () => {
    const prices = [point({ daysAgo: 400, price: 10 }), point({ daysAgo: 300, price: 20 })];

    const result = fitPurchaseToPrices({ prices, targetDate: target({ daysAgo: 300 }) });

    expect(result?.price).toBe(20);
  });

  it('moves the purchase later when the target predates all coverage', () => {
    const prices = [point({ daysAgo: 365, price: 30 }), point({ daysAgo: 100, price: 40 })];

    // The demo wants bitcoin 820 days back; CoinGecko only serves one year.
    const result = fitPurchaseToPrices({ prices, targetDate: target({ daysAgo: 820 }) });

    expect(result?.price).toBe(30);
    expect(result?.date).toEqual(prices[0]!.date);
  });

  it('never moves the purchase earlier than the target', () => {
    const prices = [point({ daysAgo: 500, price: 5 }), point({ daysAgo: 90, price: 15 })];

    const result = fitPurchaseToPrices({ prices, targetDate: target({ daysAgo: 200 }) });

    expect(result?.price).toBe(15);
  });

  it('falls back to the newest row when the whole series predates the target', () => {
    const prices = [point({ daysAgo: 900, price: 1 }), point({ daysAgo: 800, price: 2 })];

    const result = fitPurchaseToPrices({ prices, targetDate: target({ daysAgo: 30 }) });

    expect(result?.price).toBe(2);
  });

  it('handles a single-row series', () => {
    const prices = [point({ daysAgo: 42, price: 7 })];

    expect(fitPurchaseToPrices({ prices, targetDate: target({ daysAgo: 800 }) })?.price).toBe(7);
    expect(fitPurchaseToPrices({ prices, targetDate: target({ daysAgo: 1 }) })?.price).toBe(7);
  });
});
