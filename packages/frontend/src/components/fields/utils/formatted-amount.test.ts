import { describe, expect, it } from 'vitest';

import { caretOffsetAfterDigits, countDigitsBeforeCaret, parseAmountInput } from './formatted-amount';

describe('parseAmountInput', () => {
  describe("decimalSeparator '.'", () => {
    it('parses a plain integer', () => {
      expect(parseAmountInput({ raw: '1234', decimalSeparator: '.' })).toEqual({
        numeric: 1234,
        fragment: '',
      });
    });

    it('strips group separators before parsing', () => {
      expect(parseAmountInput({ raw: '1,234.5', decimalSeparator: '.' })).toEqual({
        numeric: 1234.5,
        fragment: '',
      });
    });

    it('preserves a trailing decimal point as a fragment', () => {
      expect(parseAmountInput({ raw: '1234.', decimalSeparator: '.' })).toEqual({
        numeric: 1234,
        fragment: '.',
      });
    });

    it('preserves a trailing zero decimal as a fragment', () => {
      expect(parseAmountInput({ raw: '1234.50', decimalSeparator: '.' })).toEqual({
        numeric: 1234.5,
        fragment: '0',
      });
    });

    it('preserves all-zero decimals (including the dot) as a fragment', () => {
      expect(parseAmountInput({ raw: '2.00', decimalSeparator: '.' })).toEqual({
        numeric: 2,
        fragment: '.00',
      });
    });

    it('collapses extra decimal points after the first', () => {
      expect(parseAmountInput({ raw: '1.2.3', decimalSeparator: '.' })).toEqual({
        numeric: 1.23,
        fragment: '',
      });
    });

    it('caps decimals at 2 digits', () => {
      expect(parseAmountInput({ raw: '1.234', decimalSeparator: '.' })).toEqual({
        numeric: 1.23,
        fragment: '',
      });
    });

    it('returns null numeric for an empty string', () => {
      expect(parseAmountInput({ raw: '', decimalSeparator: '.' })).toEqual({
        numeric: null,
        fragment: '',
      });
    });

    it('returns null numeric for a lone decimal point', () => {
      expect(parseAmountInput({ raw: '.', decimalSeparator: '.' })).toEqual({
        numeric: null,
        fragment: '',
      });
    });
  });

  describe("decimalSeparator ','", () => {
    it('normalizes the locale separator before parsing', () => {
      expect(parseAmountInput({ raw: '1234,56', decimalSeparator: ',' })).toEqual({
        numeric: 1234.56,
        fragment: '',
      });
    });
  });
});

describe('countDigitsBeforeCaret', () => {
  it('counts only digits, skipping group separators', () => {
    // "1,2|34" — caret after '2': '1' and '2' are anchors, ',' is not.
    expect(countDigitsBeforeCaret({ text: '1,234', caret: 3, decimalSeparator: '.' })).toBe(2);
  });

  it('counts the decimal point as an anchor', () => {
    // "1.|5" — caret after the dot: '1' and '.' both count.
    expect(countDigitsBeforeCaret({ text: '1.5', caret: 2, decimalSeparator: '.' })).toBe(2);
  });

  it('returns 0 when the caret is at the start', () => {
    expect(countDigitsBeforeCaret({ text: '1,234', caret: 0, decimalSeparator: '.' })).toBe(0);
  });
});

describe('caretOffsetAfterDigits', () => {
  it('lands right after the n-th anchor character', () => {
    // "12,345" with 3 anchors consumed: '1', '2', then ',' is skipped, '3' is
    // the 3rd anchor at index 3 — caret goes to 4.
    expect(caretOffsetAfterDigits({ text: '12,345', digitCount: 3, decimalSeparator: '.' })).toBe(4);
  });

  it('returns 0 for a non-positive digit count', () => {
    expect(caretOffsetAfterDigits({ text: '12,345', digitCount: 0, decimalSeparator: '.' })).toBe(0);
  });

  it('clamps to the end when digit count exceeds available anchors', () => {
    expect(caretOffsetAfterDigits({ text: '12,345', digitCount: 99, decimalSeparator: '.' })).toBe(6);
  });
});
