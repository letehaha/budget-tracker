import { describe, expect, it } from '@jest/globals';

import { detectYnabDecimalSeparator, parseYnabAmount } from './parse-amount';

describe('detectYnabDecimalSeparator', () => {
  it('detects a dot regime from a cell carrying both marks', () => {
    expect(detectYnabDecimalSeparator({ values: ['$1,234.56'] })).toBe('.');
  });

  it('detects a comma regime from a cell carrying both marks', () => {
    expect(detectYnabDecimalSeparator({ values: ['€1.234,56'] })).toBe(',');
  });

  it('detects a dot regime from YNAB padded decimals alone', () => {
    expect(detectYnabDecimalSeparator({ values: ['₹0.00', '₹369.00'] })).toBe('.');
  });

  it('detects a comma regime from padded decimals alone', () => {
    expect(detectYnabDecimalSeparator({ values: ['0,00 kr', '1 234,56 kr'] })).toBe(',');
  });

  it('treats a repeated separator as grouping and reads the other mark as decimal', () => {
    expect(detectYnabDecimalSeparator({ values: ['€1.234.567'] })).toBe(',');
    expect(detectYnabDecimalSeparator({ values: ['$1,234,567'] })).toBe('.');
  });

  it('defaults to dot when a zero-decimal currency gives no signal', () => {
    expect(detectYnabDecimalSeparator({ values: ['¥1,234', '¥0'] })).toBe('.');
  });

  it('defaults to dot for an empty column', () => {
    expect(detectYnabDecimalSeparator({ values: [] })).toBe('.');
    expect(detectYnabDecimalSeparator({ values: ['', '   ', null, undefined] })).toBe('.');
  });

  it('ignores unparseable cells', () => {
    expect(detectYnabDecimalSeparator({ values: ['not-money', '€1.234,56'] })).toBe(',');
  });
});

describe('parseYnabAmount', () => {
  const dot = { decimalSeparator: '.' } as const;
  const comma = { decimalSeparator: ',' } as const;

  it('parses a standard YNAB amount with $ prefix and two decimals', () => {
    expect(parseYnabAmount({ raw: '$1234.56', ...dot })).toBe(1234.56);
  });

  it('parses zero', () => {
    expect(parseYnabAmount({ raw: '$0.00', ...dot })).toBe(0);
  });

  it('parses without any currency symbol', () => {
    expect(parseYnabAmount({ raw: '369.00', ...dot })).toBe(369);
  });

  it('strips thousands separators', () => {
    expect(parseYnabAmount({ raw: '$1,234,567.89', ...dot })).toBe(1234567.89);
  });

  it('handles whitespace around the value', () => {
    expect(parseYnabAmount({ raw: '  $42.50  ', ...dot })).toBe(42.5);
  });

  it('parses negative values (defensive — YNAB does not emit these but should not crash)', () => {
    expect(parseYnabAmount({ raw: '-$5.00', ...dot })).toBe(-5);
    expect(parseYnabAmount({ raw: '$-5.00', ...dot })).toBe(-5);
  });

  it('parses a non-dollar leading symbol', () => {
    expect(parseYnabAmount({ raw: '₹1,234.56', ...dot })).toBe(1234.56);
    expect(parseYnabAmount({ raw: '₹0.00', ...dot })).toBe(0);
    expect(parseYnabAmount({ raw: '£12.30', ...dot })).toBe(12.3);
    expect(parseYnabAmount({ raw: 'R$12.30', ...dot })).toBe(12.3);
  });

  it('parses a comma-decimal regime with dot grouping', () => {
    expect(parseYnabAmount({ raw: '€1.234,56', ...comma })).toBe(1234.56);
    expect(parseYnabAmount({ raw: '€0,00', ...comma })).toBe(0);
  });

  it('parses a trailing symbol with space grouping', () => {
    expect(parseYnabAmount({ raw: '1 234,56 kr', ...comma })).toBe(1234.56);
    expect(parseYnabAmount({ raw: '1 234,56 kr', ...comma })).toBe(1234.56);
    expect(parseYnabAmount({ raw: "1'234.56 Fr.", ...dot })).toBe(1234.56);
  });

  it('treats a lone comma as grouping for a zero-decimal currency under a dot regime', () => {
    expect(parseYnabAmount({ raw: '¥1,234', ...dot })).toBe(1234);
    expect(parseYnabAmount({ raw: '¥0', ...dot })).toBe(0);
  });

  it('parses Indian lakh grouping (groups of two before the final group of three)', () => {
    expect(parseYnabAmount({ raw: '₹1,23,456.78', ...dot })).toBe(123456.78);
    expect(parseYnabAmount({ raw: '₹12,34,567', ...dot })).toBe(1234567);
  });

  it('returns null for empty input', () => {
    expect(parseYnabAmount({ raw: '', ...dot })).toBeNull();
    expect(parseYnabAmount({ raw: '   ', ...dot })).toBeNull();
  });

  it('returns null for nullish input', () => {
    expect(parseYnabAmount({ raw: null, ...dot })).toBeNull();
    expect(parseYnabAmount({ raw: undefined, ...dot })).toBeNull();
  });

  it('returns null for unparseable input', () => {
    expect(parseYnabAmount({ raw: 'abc', ...dot })).toBeNull();
    expect(parseYnabAmount({ raw: '$', ...dot })).toBeNull();
    expect(parseYnabAmount({ raw: '-', ...dot })).toBeNull();
    expect(parseYnabAmount({ raw: 'not-money', ...dot })).toBeNull();
  });

  it('returns null when separators contradict the known regime', () => {
    expect(parseYnabAmount({ raw: '12,34.56.78', ...dot })).toBeNull();
    // Grouping mark after the decimal mark is impossible in either regime.
    expect(parseYnabAmount({ raw: '1.23,456', ...dot })).toBeNull();
    expect(parseYnabAmount({ raw: '1,23.456', ...comma })).toBeNull();
  });

  it('returns null when digits are interrupted by junk', () => {
    expect(parseYnabAmount({ raw: '12a34.56', ...dot })).toBeNull();
    expect(parseYnabAmount({ raw: '12-34', ...dot })).toBeNull();
  });
});
