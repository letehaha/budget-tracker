import { describe, expect, it } from '@jest/globals';

import { parseYnabDate } from './parse-date';

describe('parseYnabDate', () => {
  it('parses a standard MM/DD/YYYY date', () => {
    expect(parseYnabDate('06/11/2026')).toBe('2026-06-11');
  });

  it('parses single-digit month and day with leading zeros stripped', () => {
    expect(parseYnabDate('1/5/2026')).toBe('2026-01-05');
  });

  it('trims surrounding whitespace', () => {
    expect(parseYnabDate('  06/11/2026  ')).toBe('2026-06-11');
  });

  it('returns null on a date that does not exist (Feb 30)', () => {
    expect(parseYnabDate('02/30/2026')).toBeNull();
  });

  it('returns null on an out-of-range month', () => {
    expect(parseYnabDate('13/01/2026')).toBeNull();
  });

  it('returns null on an out-of-range day', () => {
    expect(parseYnabDate('01/32/2026')).toBeNull();
  });

  it('returns null on the European DD/MM/YYYY when it would be ambiguous', () => {
    // 31/06 has no month 31, must reject — even though some EU users assume this format.
    expect(parseYnabDate('31/06/2026')).toBeNull();
  });

  it('returns null on ISO format (YNAB never emits this — reject so caller catches the surprise)', () => {
    expect(parseYnabDate('2026-06-11')).toBeNull();
  });

  it('returns null on empty / nullish input', () => {
    expect(parseYnabDate('')).toBeNull();
    expect(parseYnabDate('   ')).toBeNull();
    expect(parseYnabDate(null)).toBeNull();
    expect(parseYnabDate(undefined)).toBeNull();
  });

  it('returns null on garbage', () => {
    expect(parseYnabDate('hello')).toBeNull();
    expect(parseYnabDate('06-11-2026')).toBeNull();
  });
});
