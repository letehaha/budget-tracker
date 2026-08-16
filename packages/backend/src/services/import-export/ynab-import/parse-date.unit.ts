import { describe, expect, it } from '@jest/globals';

import { hasAmbiguousDateFieldOrder, parseYnabDate } from './parse-date';

describe('parseYnabDate', () => {
  const monthFirst = { fieldOrder: 'month-first' } as const;
  const dayFirst = { fieldOrder: 'day-first' } as const;

  it('parses a standard MM/DD/YYYY date', () => {
    expect(parseYnabDate({ raw: '06/11/2026', ...monthFirst })).toBe('2026-06-11');
  });

  it('parses the same value day-first when the budget uses DD/MM/YYYY', () => {
    expect(parseYnabDate({ raw: '06/11/2026', ...dayFirst })).toBe('2026-11-06');
    expect(parseYnabDate({ raw: '25/12/2026', ...dayFirst })).toBe('2026-12-25');
  });

  it('does not transpose day and month in a day-first file when the day is <= 12', () => {
    expect(parseYnabDate({ raw: '05/03/2026', ...dayFirst })).toBe('2026-03-05');
    expect(parseYnabDate({ raw: '05/03/2026', ...monthFirst })).toBe('2026-05-03');
  });

  it('parses single-digit month and day with leading zeros stripped', () => {
    expect(parseYnabDate({ raw: '1/5/2026', ...monthFirst })).toBe('2026-01-05');
  });

  it('trims surrounding whitespace', () => {
    expect(parseYnabDate({ raw: '  06/11/2026  ', ...monthFirst })).toBe('2026-06-11');
  });

  it('parses year-first dates regardless of the resolved field order', () => {
    expect(parseYnabDate({ raw: '2026-06-11', ...monthFirst })).toBe('2026-06-11');
    expect(parseYnabDate({ raw: '2026-06-11', ...dayFirst })).toBe('2026-06-11');
    expect(parseYnabDate({ raw: '2026/06/11', ...dayFirst })).toBe('2026-06-11');
  });

  it('parses dot- and dash-separated day-first dates', () => {
    expect(parseYnabDate({ raw: '11.06.2026', ...dayFirst })).toBe('2026-06-11');
    expect(parseYnabDate({ raw: '11-06-2026', ...dayFirst })).toBe('2026-06-11');
    expect(parseYnabDate({ raw: '06.11.2026', ...monthFirst })).toBe('2026-06-11');
  });

  it('returns null on a date that does not exist (Feb 30)', () => {
    expect(parseYnabDate({ raw: '02/30/2026', ...monthFirst })).toBeNull();
  });

  it('returns null on an out-of-range month', () => {
    expect(parseYnabDate({ raw: '13/01/2026', ...monthFirst })).toBeNull();
  });

  it('returns null on an out-of-range day', () => {
    expect(parseYnabDate({ raw: '01/32/2026', ...monthFirst })).toBeNull();
  });

  it('returns null when the day-first reading lands on a nonexistent day', () => {
    expect(parseYnabDate({ raw: '31/06/2026', ...dayFirst })).toBeNull();
  });

  it('returns null on empty / nullish input', () => {
    expect(parseYnabDate({ raw: '', ...monthFirst })).toBeNull();
    expect(parseYnabDate({ raw: '   ', ...monthFirst })).toBeNull();
    expect(parseYnabDate({ raw: null, ...monthFirst })).toBeNull();
    expect(parseYnabDate({ raw: undefined, ...monthFirst })).toBeNull();
  });

  it('returns null on garbage', () => {
    expect(parseYnabDate({ raw: 'hello', ...monthFirst })).toBeNull();
    expect(parseYnabDate({ raw: '11/2026', ...monthFirst })).toBeNull();
  });
});

describe('hasAmbiguousDateFieldOrder', () => {
  it('is true when every d/d/yyyy value fits both readings', () => {
    expect(hasAmbiguousDateFieldOrder({ values: ['06/11/2026', '01/05/2026'] })).toBe(true);
  });

  it('is false when at least one value disambiguates', () => {
    expect(hasAmbiguousDateFieldOrder({ values: ['25/12/2026', '01/05/2026'] })).toBe(false);
    expect(hasAmbiguousDateFieldOrder({ values: ['12/25/2026', '01/05/2026'] })).toBe(false);
  });

  it('is false when no value belongs to the ambiguous family', () => {
    expect(hasAmbiguousDateFieldOrder({ values: ['2026-06-11', '20260611'] })).toBe(false);
    expect(hasAmbiguousDateFieldOrder({ values: [] })).toBe(false);
  });
});
