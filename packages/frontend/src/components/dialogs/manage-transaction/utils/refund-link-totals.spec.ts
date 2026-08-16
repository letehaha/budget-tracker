import { describe, expect, it } from 'vitest';

import { computeRefundLinkTotals } from './refund-link-totals';

const ratesMap = {
  PLN: { rate: 0.25 },
  UAH: { rate: 0.024 },
  EUR: { rate: 1.07 },
};

describe('computeRefundLinkTotals', () => {
  it('returns empty totals when nothing is selected', () => {
    const result = computeRefundLinkTotals({
      transactions: [],
      currentAmount: 85,
      currentCurrencyCode: 'PLN',
      ratesMap,
      baseCurrencyCode: 'USD',
    });

    expect(result).toEqual({
      total: null,
      currencyCode: null,
      isTotalConverted: false,
      ratio: null,
      isOverLimit: false,
      isExactComparison: false,
    });
  });

  it('sums same-currency selections and compares exactly against the original amount', () => {
    const result = computeRefundLinkTotals({
      transactions: [
        { amount: 40, currencyCode: 'PLN' },
        { amount: 20, currencyCode: 'PLN' },
      ],
      currentAmount: 85,
      currentCurrencyCode: 'PLN',
      ratesMap,
      baseCurrencyCode: 'USD',
    });

    expect(result.total).toBe(60);
    expect(result.currencyCode).toBe('PLN');
    expect(result.isTotalConverted).toBe(false);
    expect(result.ratio).toBeCloseTo(60 / 85);
    expect(result.isOverLimit).toBe(false);
    expect(result.isExactComparison).toBe(true);
  });

  it('flags over-limit for exact same-currency comparison', () => {
    const result = computeRefundLinkTotals({
      transactions: [
        { amount: 85, currencyCode: 'PLN' },
        { amount: 254, currencyCode: 'PLN' },
      ],
      currentAmount: 85,
      currentCurrencyCode: 'PLN',
      ratesMap,
      baseCurrencyCode: 'USD',
    });

    expect(result.total).toBe(339);
    expect(result.isOverLimit).toBe(true);
    expect(result.isExactComparison).toBe(true);
  });

  it('keeps a single foreign currency total unconverted but compares via base currency', () => {
    const result = computeRefundLinkTotals({
      transactions: [{ amount: 1000, currencyCode: 'UAH' }],
      currentAmount: 85,
      currentCurrencyCode: 'PLN',
      ratesMap,
      baseCurrencyCode: 'USD',
    });

    expect(result.total).toBe(1000);
    expect(result.currencyCode).toBe('UAH');
    expect(result.isTotalConverted).toBe(false);
    // 1000 UAH = 24 USD vs 85 PLN = 21.25 USD
    expect(result.ratio).toBeCloseTo(24 / 21.25);
    expect(result.isOverLimit).toBe(true);
    expect(result.isExactComparison).toBe(false);
  });

  it('converts mixed-currency selections to the base currency', () => {
    const result = computeRefundLinkTotals({
      transactions: [
        { amount: 40, currencyCode: 'PLN' },
        { amount: 10, currencyCode: 'EUR' },
      ],
      currentAmount: 85,
      currentCurrencyCode: 'PLN',
      ratesMap,
      baseCurrencyCode: 'USD',
    });

    // 40 * 0.25 + 10 * 1.07 = 20.7 vs 85 * 0.25 = 21.25
    expect(result.total).toBeCloseTo(20.7);
    expect(result.currencyCode).toBe('USD');
    expect(result.isTotalConverted).toBe(true);
    expect(result.isOverLimit).toBe(false);
    expect(result.isExactComparison).toBe(false);
  });

  it('returns null totals when a rate needed for a mixed selection is missing', () => {
    const result = computeRefundLinkTotals({
      transactions: [
        { amount: 40, currencyCode: 'PLN' },
        { amount: 10, currencyCode: 'GBP' },
      ],
      currentAmount: 85,
      currentCurrencyCode: 'PLN',
      ratesMap,
      baseCurrencyCode: 'USD',
    });

    expect(result.total).toBeNull();
    expect(result.currencyCode).toBeNull();
    expect(result.ratio).toBeNull();
    expect(result.isOverLimit).toBe(false);
  });

  it('skips the comparison when the current amount is absent or non-positive', () => {
    for (const currentAmount of [null, undefined, 0, -5]) {
      const result = computeRefundLinkTotals({
        transactions: [{ amount: 40, currencyCode: 'PLN' }],
        currentAmount,
        currentCurrencyCode: 'PLN',
        ratesMap,
        baseCurrencyCode: 'USD',
      });

      expect(result.total).toBe(40);
      expect(result.ratio).toBeNull();
      expect(result.isOverLimit).toBe(false);
    }
  });
});
