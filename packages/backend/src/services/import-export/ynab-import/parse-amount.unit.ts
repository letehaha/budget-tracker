import { describe, expect, it } from '@jest/globals';

import { parseYnabAmount } from './parse-amount';

describe('parseYnabAmount', () => {
  it('parses a standard YNAB amount with $ prefix and two decimals', () => {
    expect(parseYnabAmount('$1234.56')).toBe(1234.56);
  });

  it('parses zero', () => {
    expect(parseYnabAmount('$0.00')).toBe(0);
  });

  it('parses without the $ prefix', () => {
    expect(parseYnabAmount('1234.56')).toBe(1234.56);
  });

  it('strips thousands separators', () => {
    expect(parseYnabAmount('$1,234,567.89')).toBe(1234567.89);
  });

  it('handles whitespace around the value', () => {
    expect(parseYnabAmount('  $42.50  ')).toBe(42.5);
  });

  it('parses negative values (defensive — YNAB does not emit these but should not crash)', () => {
    expect(parseYnabAmount('-$5.00')).toBe(-5);
    expect(parseYnabAmount('$-5.00')).toBe(-5);
  });

  it('returns null for empty input', () => {
    expect(parseYnabAmount('')).toBeNull();
    expect(parseYnabAmount('   ')).toBeNull();
  });

  it('returns null for nullish input', () => {
    expect(parseYnabAmount(null)).toBeNull();
    expect(parseYnabAmount(undefined)).toBeNull();
  });

  it('returns null for unparseable input', () => {
    expect(parseYnabAmount('abc')).toBeNull();
    expect(parseYnabAmount('$')).toBeNull();
    expect(parseYnabAmount('-')).toBeNull();
  });
});
