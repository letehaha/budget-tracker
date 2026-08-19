import { describe, expect, it } from 'vitest';

import { applyCurrencyOverride, countMissingCurrencySelections } from './currency-overrides';

const accounts = [
  { externalId: 'usd-acc', currency: 'USD' },
  { externalId: 'xxx-acc', currency: 'XXX' },
  { externalId: 'xxx-acc-2', currency: 'XXX' },
];

describe('countMissingCurrencySelections', () => {
  it('counts selected no-currency accounts without a picked currency', () => {
    expect(countMissingCurrencySelections({ accounts, selectedIds: ['xxx-acc', 'xxx-acc-2'], overrides: {} })).toBe(2);
  });

  it('ignores no-currency accounts that are not selected', () => {
    expect(countMissingCurrencySelections({ accounts, selectedIds: ['usd-acc'], overrides: {} })).toBe(0);
  });

  it('is satisfied once an override is picked', () => {
    expect(
      countMissingCurrencySelections({ accounts, selectedIds: ['xxx-acc'], overrides: { 'xxx-acc': 'EUR' } }),
    ).toBe(0);
  });
});

describe('applyCurrencyOverride', () => {
  it('adds a pick without mutating the original map', () => {
    const overrides = {};
    const next = applyCurrencyOverride({ overrides, externalId: 'xxx-acc', code: 'EUR' });
    expect(next).toEqual({ 'xxx-acc': 'EUR' });
    expect(overrides).toEqual({});
  });

  it('removes the pick when code is null', () => {
    expect(applyCurrencyOverride({ overrides: { 'xxx-acc': 'EUR' }, externalId: 'xxx-acc', code: null })).toEqual({});
  });
});
