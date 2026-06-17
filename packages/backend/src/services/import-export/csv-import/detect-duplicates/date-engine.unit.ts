import { describe, expect, it } from '@jest/globals';

import { type DateColumnFormat, detectDateColumnFormat, parseImportDate } from './date-engine';

// A neutral format for value-shape tests where field order is irrelevant
// (ISO, ISO-datetime and compact values carry their order intrinsically).
const ANY_FORMAT: DateColumnFormat = { fieldOrder: 'month-first' };

describe('parseImportDate', () => {
  it('returns an instant for a full ISO datetime with Z (the exact moment)', () => {
    const result = parseImportDate({ value: '2026-06-16T18:17:19.587Z', format: ANY_FORMAT });

    expect(result).toEqual({
      kind: 'instant',
      instant: new Date('2026-06-16T18:17:19.587Z'),
    });
  });

  it('returns an instant for an ISO datetime with a numeric offset (absolute moment preserved)', () => {
    const result = parseImportDate({ value: '2026-06-16T18:17:19.587+02:00', format: ANY_FORMAT });

    // +02:00 local 18:17 is the same absolute moment as 16:17 UTC.
    expect(result).toEqual({
      kind: 'instant',
      instant: new Date('2026-06-16T16:17:19.587Z'),
    });
  });

  it('returns localDateTime for a space-separated date+time without a zone (no tz shift)', () => {
    const result = parseImportDate({ value: '2026-06-16 18:17', format: ANY_FORMAT });

    expect(result).toEqual({
      kind: 'localDateTime',
      year: 2026,
      month: 6,
      day: 16,
      hour: 18,
      minute: 17,
      second: 0,
      ms: 0,
    });
  });

  it('returns localDateTime for a T-separated date+time without a zone (no tz shift)', () => {
    const result = parseImportDate({ value: '2026-06-16T18:17:00', format: ANY_FORMAT });

    expect(result).toEqual({
      kind: 'localDateTime',
      year: 2026,
      month: 6,
      day: 16,
      hour: 18,
      minute: 17,
      second: 0,
      ms: 0,
    });
  });

  it('returns dateOnly for a plain ISO date', () => {
    const result = parseImportDate({ value: '2026-06-01', format: ANY_FORMAT });

    expect(result).toEqual({ kind: 'dateOnly', year: 2026, month: 6, day: 1 });
  });

  it('returns dateOnly for year-first dates with slash or dot separators', () => {
    expect(parseImportDate({ value: '2026/06/01', format: ANY_FORMAT })).toEqual({
      kind: 'dateOnly',
      year: 2026,
      month: 6,
      day: 1,
    });
    expect(parseImportDate({ value: '2026.06.01', format: ANY_FORMAT })).toEqual({
      kind: 'dateOnly',
      year: 2026,
      month: 6,
      day: 1,
    });
  });

  it('returns dateOnly for a compact 8-digit YYYYMMDD value', () => {
    const result = parseImportDate({ value: '20260601', format: ANY_FORMAT });

    expect(result).toEqual({ kind: 'dateOnly', year: 2026, month: 6, day: 1 });
  });

  it('returns null for invalid or unparseable values (no silent rollover)', () => {
    // Out-of-range month/day must fail loudly rather than snapping forward
    // (the way `new Date('2026-13-40')` would).
    expect(parseImportDate({ value: '2026-13-40', format: ANY_FORMAT })).toBeNull();
    expect(parseImportDate({ value: 'garbage', format: ANY_FORMAT })).toBeNull();
    expect(parseImportDate({ value: '', format: ANY_FORMAT })).toBeNull();
  });
});

describe('detectDateColumnFormat', () => {
  it('resolves a column to day-first when a row disambiguates by day > 12, fixing the misparse', () => {
    // The headline bug: a day-first user (Uruguay) writes June 8 as 08/06/2026.
    // The presence of 13/06/2026 (day 13 can't be a month) forces day-first for
    // the WHOLE column, so 08/06/2026 parses to June 8 — not Aug 6, the way the
    // old US MM/DD tiebreak read it.
    const detection = detectDateColumnFormat({
      values: ['13/06/2026', '08/06/2026'],
      locale: 'es',
    });

    expect(detection).toEqual({ ok: true, format: { fieldOrder: 'day-first' } });

    if (!detection.ok) throw new Error('expected a resolved format');
    expect(parseImportDate({ value: '08/06/2026', format: detection.format })).toEqual({
      kind: 'dateOnly',
      year: 2026,
      month: 6,
      day: 8,
    });
  });

  it('resolves a column to month-first when a row disambiguates by second field > 12', () => {
    // 06/13/2026: 13 in the second field can only be a day, so the column is
    // month-first regardless of locale.
    const detection = detectDateColumnFormat({
      values: ['06/13/2026', '06/08/2026'],
      locale: 'es',
    });

    expect(detection).toEqual({ ok: true, format: { fieldOrder: 'month-first' } });
  });

  it('falls back to the locale convention when no row disambiguates the column', () => {
    // Every field is ≤ 12, so nothing forces an order. Spanish/Ukrainian users
    // write day-first; English users write month-first.
    const ambiguousValues = ['06/08/2026', '05/04/2026'];

    expect(detectDateColumnFormat({ values: ambiguousValues, locale: 'es' })).toEqual({
      ok: true,
      format: { fieldOrder: 'day-first' },
    });
    expect(detectDateColumnFormat({ values: ambiguousValues, locale: 'en' })).toEqual({
      ok: true,
      format: { fieldOrder: 'month-first' },
    });
  });

  it('reports a mixed column when rows force contradicting orders', () => {
    // 15/06/2026 can only be day-first (day 15); 06/15/2026 can only be
    // month-first (day 15 in second field). No single order is safe, so the
    // engine refuses to guess and surfaces it to the caller.
    const detection = detectDateColumnFormat({
      values: ['15/06/2026', '06/15/2026'],
      locale: 'en',
    });

    expect(detection).toEqual({ ok: false, reason: 'mixed' });
  });
});
