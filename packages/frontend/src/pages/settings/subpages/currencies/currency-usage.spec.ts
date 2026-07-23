import { describe, expect, it } from 'vitest';

import { buildCurrencyUsageMap } from './currency-usage';

describe('buildCurrencyUsageMap', () => {
  it('returns an empty map for an empty account list', () => {
    expect(buildCurrencyUsageMap({ accounts: [] })).toEqual({});
  });

  it('counts accounts per currency code', () => {
    const accounts = [
      { currencyCode: 'USD' },
      { currencyCode: 'USD' },
      { currencyCode: 'EUR' },
      { currencyCode: 'USD' },
      { currencyCode: 'GBP' },
    ];

    expect(buildCurrencyUsageMap({ accounts })).toEqual({ USD: 3, EUR: 1, GBP: 1 });
  });

  it('omits currencies with zero accounts (missing key reads as unused)', () => {
    const usage = buildCurrencyUsageMap({ accounts: [{ currencyCode: 'USD' }] });

    expect(usage.USD).toBe(1);
    expect(usage.EUR).toBeUndefined();
    expect(usage.EUR ?? 0).toBe(0);
  });

  it('ignores entries with an empty currency code', () => {
    const accounts = [{ currencyCode: '' }, { currencyCode: 'USD' }, { currencyCode: '' }];

    expect(buildCurrencyUsageMap({ accounts })).toEqual({ USD: 1 });
  });
});
