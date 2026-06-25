import { describe, expect, it } from '@jest/globals';

import { parseAmount } from './parse-amount';

describe('parseAmount (core tabular-import amount parser)', () => {
  it('returns null for empty or blank input', () => {
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('   ')).toBeNull();
  });

  it('returns null for non-numeric input', () => {
    expect(parseAmount('abc')).toBeNull();
    expect(parseAmount('--')).toBeNull();
  });

  it('parses plain decimals into integer cents', () => {
    expect(parseAmount('1234.56')).toBe(123456);
    expect(parseAmount('1234')).toBe(123400);
    expect(parseAmount('0.5')).toBe(50);
  });

  it('strips US/UK thousands separators', () => {
    expect(parseAmount('1,234.56')).toBe(123456);
    expect(parseAmount('1,000,000.00')).toBe(100000000);
  });

  it('parses European format (period thousands, comma decimal)', () => {
    expect(parseAmount('1.234,56')).toBe(123456);
    expect(parseAmount('1.000.000,00')).toBe(100000000);
  });

  it('treats a lone comma as the decimal separator', () => {
    // With no period present, the comma is read as the decimal point (European
    // convention), not a thousands separator: '1,5' -> 1.5, '1,234' -> 1.234.
    expect(parseAmount('1,5')).toBe(150);
    expect(parseAmount('1,234')).toBe(123);
  });

  it('treats parentheses as a negative (accounting format)', () => {
    expect(parseAmount('(1234.56)')).toBe(-123456);
    expect(parseAmount('(100)')).toBe(-10000);
  });

  it('honors explicit signs', () => {
    expect(parseAmount('-1234.56')).toBe(-123456);
    expect(parseAmount('+500')).toBe(50000);
  });

  it('strips currency symbols and whitespace', () => {
    expect(parseAmount('$1,000.00')).toBe(100000);
    expect(parseAmount('€1.000,50')).toBe(100050);
    expect(parseAmount('£10.00')).toBe(1000);
    expect(parseAmount('¥1000')).toBe(100000);
    expect(parseAmount('₴ 250.00')).toBe(25000);
    expect(parseAmount('₽5')).toBe(500);
    expect(parseAmount('  100.00  ')).toBe(10000);
  });

  it('rounds sub-cent precision to the nearest cent', () => {
    expect(parseAmount('10.994')).toBe(1099);
    expect(parseAmount('10.996')).toBe(1100);
  });
});
