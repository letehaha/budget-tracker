import { describe, expect, it } from '@jest/globals';

import { toUtcDateString } from './date';

describe('toUtcDateString', () => {
  describe('Date input', () => {
    it('formats a standard mid-year UTC date', () => {
      expect(toUtcDateString(new Date('2025-06-15T12:34:56Z'))).toBe('2025-06-15');
    });

    it('zero-pads single-digit months', () => {
      expect(toUtcDateString(new Date('2025-01-15T00:00:00Z'))).toBe('2025-01-15');
      expect(toUtcDateString(new Date('2025-09-15T00:00:00Z'))).toBe('2025-09-15');
    });

    it('zero-pads single-digit days', () => {
      expect(toUtcDateString(new Date('2025-06-01T00:00:00Z'))).toBe('2025-06-01');
      expect(toUtcDateString(new Date('2025-06-09T00:00:00Z'))).toBe('2025-06-09');
    });

    it('zero-pads single-digit month AND day together', () => {
      expect(toUtcDateString(new Date('2025-01-01T00:00:00Z'))).toBe('2025-01-01');
      expect(toUtcDateString(new Date('2025-09-09T00:00:00Z'))).toBe('2025-09-09');
    });

    it('uses UTC, not local timezone', () => {
      // 2025-01-15 at 23:30 UTC is 2025-01-16 in tz=+02:00 (and 2025-01-15 in
      // tz=-05:00). The helper must return the UTC calendar day regardless of
      // the host TZ — otherwise rate/price keys disagree across deploys.
      expect(toUtcDateString(new Date('2025-01-15T23:30:00Z'))).toBe('2025-01-15');
      expect(toUtcDateString(new Date('2025-01-16T00:30:00Z'))).toBe('2025-01-16');
    });

    it('handles the last day of the year', () => {
      expect(toUtcDateString(new Date('2025-12-31T23:59:59Z'))).toBe('2025-12-31');
    });

    it('handles the first day of the year', () => {
      expect(toUtcDateString(new Date('2025-01-01T00:00:00Z'))).toBe('2025-01-01');
    });

    it('handles a leap-day', () => {
      expect(toUtcDateString(new Date('2024-02-29T00:00:00Z'))).toBe('2024-02-29');
    });

    it('handles a four-digit year far in the past', () => {
      expect(toUtcDateString(new Date('1999-12-31T00:00:00Z'))).toBe('1999-12-31');
    });

    it('handles a four-digit year far in the future', () => {
      expect(toUtcDateString(new Date('2999-07-04T00:00:00Z'))).toBe('2999-07-04');
    });
  });

  describe('string input', () => {
    it('slices an ISO timestamp to YYYY-MM-DD', () => {
      expect(toUtcDateString('2025-01-15T00:00:00.000Z')).toBe('2025-01-15');
      expect(toUtcDateString('2025-12-31T23:59:59Z')).toBe('2025-12-31');
    });

    it('slices a Postgres timestamptz text representation', () => {
      expect(toUtcDateString('2026-06-20 12:00:00+00')).toBe('2026-06-20');
    });

    it('returns an already-formatted YYYY-MM-DD string unchanged', () => {
      expect(toUtcDateString('2025-06-15')).toBe('2025-06-15');
    });

    it('slices any string at least 10 chars long', () => {
      // The helper does not validate format — it trusts the caller passes
      // either an ISO-shaped timestamp or a YYYY-MM-DD value (both start with
      // 10 chars of date). Anything longer is sliced to the first 10 chars.
      expect(toUtcDateString('2025-06-15extra')).toBe('2025-06-15');
    });

    it('returns a short string unchanged (defensive edge case)', () => {
      expect(toUtcDateString('')).toBe('');
      expect(toUtcDateString('2025-06')).toBe('2025-06');
    });
  });
});
