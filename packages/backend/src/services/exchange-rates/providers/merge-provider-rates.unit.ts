import { EXCHANGE_RATE_PROVIDER_TYPE } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';

import { findMissingCurrencies, mergeProviderRates, ProviderRatesInput } from './merge-provider-rates';

const { CURRENCY_RATES_API, FRANKFURTER, API_LAYER } = EXCHANGE_RATE_PROVIDER_TYPE;

describe('mergeProviderRates', () => {
  it('attributes every rate from a single provider to that provider', () => {
    const providerRates: ProviderRatesInput[] = [
      { type: CURRENCY_RATES_API, name: 'Currency Rates API', rates: { EUR: 0.9, UAH: 41 } },
    ];

    const { rates, providersUsed } = mergeProviderRates({ providerRates, baseCurrency: 'USD' });

    expect(rates).toEqual({
      EUR: { rate: 0.9, source: CURRENCY_RATES_API },
      UAH: { rate: 41, source: CURRENCY_RATES_API },
    });
    expect(providersUsed).toEqual([{ name: 'Currency Rates API', type: CURRENCY_RATES_API, ratesContributed: 2 }]);
  });

  it('keeps the higher-priority value AND source when providers overlap', () => {
    // Same currency from two providers with DIFFERENT values — proves precedence
    // applies to the value, not just the source label.
    const providerRates: ProviderRatesInput[] = [
      { type: CURRENCY_RATES_API, name: 'Currency Rates API', rates: { EUR: 0.9 } },
      { type: API_LAYER, name: 'ApiLayer', rates: { EUR: 0.95 } },
    ];

    const { rates } = mergeProviderRates({ providerRates, baseCurrency: 'USD' });

    expect(rates.EUR).toEqual({ rate: 0.9, source: CURRENCY_RATES_API });
  });

  it('lets a lower-priority provider fill only the currencies higher ones omitted', () => {
    const providerRates: ProviderRatesInput[] = [
      { type: CURRENCY_RATES_API, name: 'Currency Rates API', rates: { EUR: 0.9 } },
      { type: API_LAYER, name: 'ApiLayer', rates: { EUR: 0.95, ETB: 121 } },
    ];

    const { rates, providersUsed } = mergeProviderRates({ providerRates, baseCurrency: 'USD' });

    expect(rates).toEqual({
      EUR: { rate: 0.9, source: CURRENCY_RATES_API },
      ETB: { rate: 121, source: API_LAYER },
    });
    expect(providersUsed).toEqual([
      { name: 'Currency Rates API', type: CURRENCY_RATES_API, ratesContributed: 1 },
      { name: 'ApiLayer', type: API_LAYER, ratesContributed: 1 },
    ]);
  });

  it('never emits the base currency as a quote', () => {
    const providerRates: ProviderRatesInput[] = [{ type: API_LAYER, name: 'ApiLayer', rates: { USD: 1, EUR: 0.9 } }];

    const { rates } = mergeProviderRates({ providerRates, baseCurrency: 'USD' });

    expect(rates.USD).toBeUndefined();
    expect(rates.EUR).toEqual({ rate: 0.9, source: API_LAYER });
  });

  it('omits a provider that contributed no new rates from providersUsed', () => {
    const providerRates: ProviderRatesInput[] = [
      { type: CURRENCY_RATES_API, name: 'Currency Rates API', rates: { EUR: 0.9, UAH: 41 } },
      // Fully redundant: every currency already covered by the primary.
      { type: FRANKFURTER, name: 'Frankfurter', rates: { EUR: 0.95, UAH: 42 } },
    ];

    const { providersUsed } = mergeProviderRates({ providerRates, baseCurrency: 'USD' });

    expect(providersUsed).toEqual([{ name: 'Currency Rates API', type: CURRENCY_RATES_API, ratesContributed: 2 }]);
  });

  it('returns empty result when no providers supplied rates', () => {
    expect(mergeProviderRates({ providerRates: [], baseCurrency: 'USD' })).toEqual({ rates: {}, providersUsed: [] });
  });

  it('skips an invalid rate so a lower-priority provider can fill it', () => {
    // A higher-priority provider supplying a garbage value (NaN, 0, negative,
    // Infinity) must NOT block a healthy fallback. Otherwise the bad value would
    // win the slot and persist — the same silent-staleness failure this merge
    // exists to prevent, just relocated from "missing" to "bad value wins".
    const providerRates: ProviderRatesInput[] = [
      { type: CURRENCY_RATES_API, name: 'Currency Rates API', rates: { EUR: NaN, GBP: 0, JPY: -5, CHF: Infinity } },
      { type: API_LAYER, name: 'ApiLayer', rates: { EUR: 0.95, GBP: 0.8, JPY: 150, CHF: 1.1 } },
    ];

    const { rates, providersUsed } = mergeProviderRates({ providerRates, baseCurrency: 'USD' });

    expect(rates).toEqual({
      EUR: { rate: 0.95, source: API_LAYER },
      GBP: { rate: 0.8, source: API_LAYER },
      JPY: { rate: 150, source: API_LAYER },
      CHF: { rate: 1.1, source: API_LAYER },
    });
    // The primary contributed nothing valid, so it must not appear as a contributor.
    expect(providersUsed).toEqual([{ name: 'ApiLayer', type: API_LAYER, ratesContributed: 4 }]);
  });

  it('drops an invalid rate entirely when no provider supplies a valid one', () => {
    // If every provider's value for a currency is invalid, that currency is left
    // uncovered rather than persisted with garbage — surfaced later as a coverage gap.
    const providerRates: ProviderRatesInput[] = [
      { type: CURRENCY_RATES_API, name: 'Currency Rates API', rates: { EUR: 0.9, BAD: NaN } },
    ];

    const { rates } = mergeProviderRates({ providerRates, baseCurrency: 'USD' });

    expect(rates.BAD).toBeUndefined();
    expect(rates.EUR).toEqual({ rate: 0.9, source: CURRENCY_RATES_API });
  });
});

describe('findMissingCurrencies', () => {
  it('returns expected currencies absent from the covered set', () => {
    const missing = findMissingCurrencies({
      expected: ['USD', 'EUR', 'ETB', 'XAF'],
      covered: ['EUR'],
      baseCurrency: 'USD',
    });

    expect(missing).toEqual(['ETB', 'XAF']);
  });

  it('excludes the base currency even when uncovered', () => {
    const missing = findMissingCurrencies({ expected: ['USD', 'EUR'], covered: ['EUR'], baseCurrency: 'USD' });

    expect(missing).toEqual([]);
  });

  it('returns empty when everything expected is covered', () => {
    const missing = findMissingCurrencies({ expected: ['EUR', 'ETB'], covered: ['EUR', 'ETB'], baseCurrency: 'USD' });

    expect(missing).toEqual([]);
  });
});
