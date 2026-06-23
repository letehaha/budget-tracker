import { describe, expect, it } from '@jest/globals';

import { parseBudgetBakersWalletAmount } from './parse-amount';

describe('parseBudgetBakersWalletAmount', () => {
  it('parses a plain integer amount', () => {
    expect(parseBudgetBakersWalletAmount({ raw: '400' })).toBe(400);
  });

  it('parses a decimal amount with dot separator', () => {
    expect(parseBudgetBakersWalletAmount({ raw: '8500.75' })).toBe(8500.75);
  });

  it('parses zero', () => {
    expect(parseBudgetBakersWalletAmount({ raw: '0' })).toBe(0);
    expect(parseBudgetBakersWalletAmount({ raw: '0.00' })).toBe(0);
  });

  it('parses a large amount', () => {
    expect(parseBudgetBakersWalletAmount({ raw: '354046.04' })).toBe(354046.04);
  });

  it('trims surrounding whitespace', () => {
    expect(parseBudgetBakersWalletAmount({ raw: '  1234.56  ' })).toBe(1234.56);
  });

  it('returns null for empty input', () => {
    expect(parseBudgetBakersWalletAmount({ raw: '' })).toBeNull();
    expect(parseBudgetBakersWalletAmount({ raw: '   ' })).toBeNull();
  });

  it('returns null for nullish input', () => {
    expect(parseBudgetBakersWalletAmount({ raw: null })).toBeNull();
    expect(parseBudgetBakersWalletAmount({ raw: undefined })).toBeNull();
  });

  it('returns null for negative values — Wallet amounts are always positive', () => {
    expect(parseBudgetBakersWalletAmount({ raw: '-100' })).toBeNull();
  });

  it('returns null for unparseable input', () => {
    expect(parseBudgetBakersWalletAmount({ raw: 'abc' })).toBeNull();
    expect(parseBudgetBakersWalletAmount({ raw: '$400' })).toBeNull();
    expect(parseBudgetBakersWalletAmount({ raw: '1,234.56' })).toBeNull();
  });

  // T6: Infinity strings are not finite numbers and must return null.
  it('returns null for "Infinity" and "-Infinity" — neither is a finite number', () => {
    expect(parseBudgetBakersWalletAmount({ raw: 'Infinity' })).toBeNull();
    expect(parseBudgetBakersWalletAmount({ raw: '-Infinity' })).toBeNull();
  });
});
