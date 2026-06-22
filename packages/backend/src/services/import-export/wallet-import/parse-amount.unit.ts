import { describe, expect, it } from '@jest/globals';

import { parseWalletAmount } from './parse-amount';

describe('parseWalletAmount', () => {
  it('parses a plain integer amount', () => {
    expect(parseWalletAmount({ raw: '400' })).toBe(400);
  });

  it('parses a decimal amount with dot separator', () => {
    expect(parseWalletAmount({ raw: '8500.75' })).toBe(8500.75);
  });

  it('parses zero', () => {
    expect(parseWalletAmount({ raw: '0' })).toBe(0);
    expect(parseWalletAmount({ raw: '0.00' })).toBe(0);
  });

  it('parses a large amount', () => {
    expect(parseWalletAmount({ raw: '354046.04' })).toBe(354046.04);
  });

  it('trims surrounding whitespace', () => {
    expect(parseWalletAmount({ raw: '  1234.56  ' })).toBe(1234.56);
  });

  it('returns null for empty input', () => {
    expect(parseWalletAmount({ raw: '' })).toBeNull();
    expect(parseWalletAmount({ raw: '   ' })).toBeNull();
  });

  it('returns null for nullish input', () => {
    expect(parseWalletAmount({ raw: null })).toBeNull();
    expect(parseWalletAmount({ raw: undefined })).toBeNull();
  });

  it('returns null for negative values — Wallet amounts are always positive', () => {
    expect(parseWalletAmount({ raw: '-100' })).toBeNull();
  });

  it('returns null for unparseable input', () => {
    expect(parseWalletAmount({ raw: 'abc' })).toBeNull();
    expect(parseWalletAmount({ raw: '$400' })).toBeNull();
    expect(parseWalletAmount({ raw: '1,234.56' })).toBeNull();
  });

  // T6: Infinity strings are not finite numbers and must return null.
  it('returns null for "Infinity" and "-Infinity" — neither is a finite number', () => {
    expect(parseWalletAmount({ raw: 'Infinity' })).toBeNull();
    expect(parseWalletAmount({ raw: '-Infinity' })).toBeNull();
  });
});
