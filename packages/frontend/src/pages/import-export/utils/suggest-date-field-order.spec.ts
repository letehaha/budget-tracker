import { describe, expect, it } from 'vitest';

import {
  countMismatchedDateCells,
  detectDateSeparator,
  parseDateCellParts,
  suggestDateFieldOrder,
} from './suggest-date-field-order';

// ---------------------------------------------------------------------------
// suggestDateFieldOrder
// ---------------------------------------------------------------------------

describe('suggestDateFieldOrder', () => {
  it('suggests day-first when a lead field above 12 disambiguates', () => {
    const result = suggestDateFieldOrder({ values: ['13.06.2026', '08.06.2026'] });

    expect(result).toEqual({ suggestion: 'day-first', isAmbiguous: false, isIsoOnly: false, conflict: false });
  });

  it('suggests month-first when a second field above 12 disambiguates', () => {
    const result = suggestDateFieldOrder({ values: ['06/13/2026', '06/08/2026'] });

    expect(result).toEqual({ suggestion: 'month-first', isAmbiguous: false, isIsoOnly: false, conflict: false });
  });

  it('reports a conflict when values force contradicting orders', () => {
    const result = suggestDateFieldOrder({ values: ['15/06/2026', '06/15/2026'] });

    expect(result).toEqual({ suggestion: null, isAmbiguous: false, isIsoOnly: false, conflict: true });
  });

  it('is ambiguous with the locale fallback as suggestion when every field is ≤ 12', () => {
    const result = suggestDateFieldOrder({ values: ['06/08/2026', '05/04/2026'], localeFallback: 'day-first' });

    expect(result).toEqual({ suggestion: 'day-first', isAmbiguous: true, isIsoOnly: false, conflict: false });
  });

  it('is ambiguous with no suggestion when there is no data signal and no locale fallback', () => {
    const result = suggestDateFieldOrder({ values: ['06/08/2026'] });

    expect(result).toEqual({ suggestion: null, isAmbiguous: true, isIsoOnly: false, conflict: false });
  });

  it('flags an all-ISO column as isIsoOnly (no day/month pick needed)', () => {
    const result = suggestDateFieldOrder({
      values: ['2026-06-01', '2026-06-16T18:17:19.587Z', '2026-06-16 18:17', '20260601'],
    });

    expect(result).toEqual({ suggestion: null, isAmbiguous: false, isIsoOnly: true, conflict: false });
  });

  it('does not flag isIsoOnly when a single ambiguous-family cell is mixed in', () => {
    const result = suggestDateFieldOrder({ values: ['2026-06-01', '08/06/2026'] });

    expect(result.isIsoOnly).toBe(false);
    expect(result.isAmbiguous).toBe(true);
  });

  it('ignores empty and whitespace-only cells', () => {
    const result = suggestDateFieldOrder({ values: ['', '   ', '13.06.2026'] });

    expect(result.suggestion).toBe('day-first');
  });

  it('treats an empty column as ambiguous, not ISO-only', () => {
    const result = suggestDateFieldOrder({ values: [], localeFallback: 'month-first' });

    expect(result).toEqual({ suggestion: 'month-first', isAmbiguous: true, isIsoOnly: false, conflict: false });
  });

  it('a >12 data signal wins over a contradicting locale fallback', () => {
    // German-style day-first data must not be overridden by an en month-first locale.
    const result = suggestDateFieldOrder({ values: ['13.01.2026', '12.01.2026'], localeFallback: 'month-first' });

    expect(result.suggestion).toBe('day-first');
    expect(result.isAmbiguous).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// parseDateCellParts
// ---------------------------------------------------------------------------

describe('parseDateCellParts', () => {
  it('resolves the ambiguous family per the given order', () => {
    expect(parseDateCellParts({ value: '12.01.2026', fieldOrder: 'day-first' })).toEqual({
      year: 2026,
      month: 1,
      day: 12,
    });
    expect(parseDateCellParts({ value: '12.01.2026', fieldOrder: 'month-first' })).toEqual({
      year: 2026,
      month: 12,
      day: 1,
    });
  });

  it('returns null when the value is impossible under the given order', () => {
    // 01/13 read day-first puts 13 in the month position.
    expect(parseDateCellParts({ value: '01/13/2026', fieldOrder: 'day-first' })).toBeNull();
    expect(parseDateCellParts({ value: '13.13.2026', fieldOrder: 'day-first' })).toBeNull();
    expect(parseDateCellParts({ value: '13.13.2026', fieldOrder: 'month-first' })).toBeNull();
  });

  it('parses intrinsically ordered shapes regardless of the order', () => {
    expect(parseDateCellParts({ value: '2026-06-01', fieldOrder: 'day-first' })).toEqual({
      year: 2026,
      month: 6,
      day: 1,
    });
    expect(parseDateCellParts({ value: '20260601', fieldOrder: 'month-first' })).toEqual({
      year: 2026,
      month: 6,
      day: 1,
    });
    expect(parseDateCellParts({ value: '2026-06-16 18:17', fieldOrder: 'day-first' })).toEqual({
      year: 2026,
      month: 6,
      day: 16,
    });
  });

  it('reports the UTC calendar day for a zoned ISO datetime', () => {
    expect(parseDateCellParts({ value: '2026-06-16T23:30:00-03:00', fieldOrder: 'day-first' })).toEqual({
      year: 2026,
      month: 6,
      day: 17,
    });
  });

  it('rejects invalid calendar dates instead of rolling them over', () => {
    expect(parseDateCellParts({ value: '2026-02-30', fieldOrder: 'day-first' })).toBeNull();
    expect(parseDateCellParts({ value: '30.02.2026', fieldOrder: 'day-first' })).toBeNull();
  });

  it('returns null for unrecognized values', () => {
    expect(parseDateCellParts({ value: 'garbage', fieldOrder: 'day-first' })).toBeNull();
    expect(parseDateCellParts({ value: '', fieldOrder: 'day-first' })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// countMismatchedDateCells
// ---------------------------------------------------------------------------

describe('countMismatchedDateCells', () => {
  it('counts only cells that fail under the given order, ignoring empties', () => {
    const values = ['13.06.2026', '06.13.2026', '2026-06-01', '', 'garbage'];

    // Day-first: 06.13 puts 13 in the month position → mismatch; garbage → mismatch.
    expect(countMismatchedDateCells({ values, fieldOrder: 'day-first' })).toBe(2);
    // Month-first: 13.06 is month 13 → mismatch; garbage → mismatch.
    expect(countMismatchedDateCells({ values, fieldOrder: 'month-first' })).toBe(2);
  });

  it('returns 0 when every cell parses', () => {
    expect(countMismatchedDateCells({ values: ['01.02.2026', '2026-06-01'], fieldOrder: 'day-first' })).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// detectDateSeparator
// ---------------------------------------------------------------------------

describe('detectDateSeparator', () => {
  it('returns the separator of the first ambiguous-family cell', () => {
    expect(detectDateSeparator({ values: ['12.01.2026'] })).toBe('.');
    expect(detectDateSeparator({ values: ['12/01/2026'] })).toBe('/');
    expect(detectDateSeparator({ values: ['12-01-2026'] })).toBe('-');
  });

  it('skips ISO cells and returns null when no ambiguous-family cell exists', () => {
    expect(detectDateSeparator({ values: ['2026-06-01', '20260601'] })).toBeNull();
    expect(detectDateSeparator({ values: [] })).toBeNull();
  });
});
