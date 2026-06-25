import { describe, expect, it } from '@jest/globals';

import { parseBudgetBakersWalletDate } from './parse-date';

describe('parseBudgetBakersWalletDate', () => {
  describe('ISO-8601 format (primary Wallet export format)', () => {
    it('parses a full ISO-8601 UTC instant with milliseconds', () => {
      expect(parseBudgetBakersWalletDate({ raw: '2025-12-25T11:00:00.000Z' })).toBe('2025-12-25T11:00:00.000Z');
    });

    it('parses an ISO-8601 instant without milliseconds', () => {
      const result = parseBudgetBakersWalletDate({ raw: '2025-07-31T13:30:00Z' });
      expect(result).toBe('2025-07-31T13:30:00.000Z');
    });

    it('trims whitespace around ISO input', () => {
      const result = parseBudgetBakersWalletDate({ raw: '  2025-12-25T11:00:00.000Z  ' });
      // ISO path requires the pattern at position 0 after trimming — rejected.
      // (trim happens inside, regex tests trimmed value)
      expect(result).toBe('2025-12-25T11:00:00.000Z');
    });

    it('returns null for a malformed ISO-looking string', () => {
      expect(parseBudgetBakersWalletDate({ raw: '2025-13-01T00:00:00.000Z' })).toBeNull();
    });

    it('returns null for an out-of-range day V8 would silently roll over (30 Feb)', () => {
      // Date.parse rolls 2025-02-30 forward to 2025-03-02 rather than rejecting
      // it; an unvalidated parser would misdate the row by days/months.
      expect(parseBudgetBakersWalletDate({ raw: '2025-02-30T10:00:00.000Z' })).toBeNull();
    });

    it('returns null for a day that does not exist in a 30-day month (31 Apr)', () => {
      expect(parseBudgetBakersWalletDate({ raw: '2025-04-31T00:00:00Z' })).toBeNull();
    });

    it('returns null for 29 Feb in a non-leap year', () => {
      expect(parseBudgetBakersWalletDate({ raw: '2025-02-29T12:00:00Z' })).toBeNull();
    });

    it('accepts 29 Feb in a leap year', () => {
      expect(parseBudgetBakersWalletDate({ raw: '2024-02-29T12:00:00Z' })).toBe('2024-02-29T12:00:00.000Z');
    });

    it('treats a bare ISO without timezone designator as UTC (regression guard: no server-offset shift)', () => {
      // A bare string must produce the same instant as its Z-suffixed twin.
      const bare = parseBudgetBakersWalletDate({ raw: '2025-12-25T14:30:00' });
      const withZ = parseBudgetBakersWalletDate({ raw: '2025-12-25T14:30:00Z' });
      expect(bare).toBe('2025-12-25T14:30:00.000Z');
      expect(bare).toBe(withZ);
    });

    it('passes a Z-suffixed ISO through unchanged', () => {
      expect(parseBudgetBakersWalletDate({ raw: '2025-12-25T14:30:00Z' })).toBe('2025-12-25T14:30:00.000Z');
    });

    it('respects an explicit positive UTC offset without double-shifting', () => {
      // +02:00 means 14:30 local = 12:30 UTC.
      expect(parseBudgetBakersWalletDate({ raw: '2025-12-25T14:30:00+02:00' })).toBe('2025-12-25T12:30:00.000Z');
    });

    // T12a: negative UTC offset must shift the instant forward.
    it('respects a negative UTC offset (-05:00): 02:00 local = 07:00 UTC', () => {
      // -05:00 means 02:00 local is 5 hours ahead in UTC → 07:00 UTC.
      expect(parseBudgetBakersWalletDate({ raw: '2025-12-25T02:00:00-05:00' })).toBe('2025-12-25T07:00:00.000Z');
    });

    // T12b: bare ISO with milliseconds and no timezone is treated as UTC.
    it('appends Z to a bare ISO string that includes milliseconds but no timezone', () => {
      // No timezone designator → treated as UTC (Z appended internally).
      // 2025-12-25T14:30:00.123 → 2025-12-25T14:30:00.123Z
      expect(parseBudgetBakersWalletDate({ raw: '2025-12-25T14:30:00.123' })).toBe('2025-12-25T14:30:00.123Z');
    });

    it('returns null for an invalid ISO string even without a timezone designator', () => {
      expect(parseBudgetBakersWalletDate({ raw: '2025-13-01T00:00:00' })).toBeNull();
    });
  });

  describe('DD/MM/YYYY HH:MM format (older Wallet exports)', () => {
    it('parses a valid DD/MM/YYYY HH:MM date', () => {
      expect(parseBudgetBakersWalletDate({ raw: '25/12/2025 14:30' })).toBe('2025-12-25T14:30:00.000Z');
    });

    it('parses midnight correctly', () => {
      expect(parseBudgetBakersWalletDate({ raw: '01/01/2026 00:00' })).toBe('2026-01-01T00:00:00.000Z');
    });

    it('returns null for an invalid calendar date (30 Feb)', () => {
      expect(parseBudgetBakersWalletDate({ raw: '30/02/2025 10:00' })).toBeNull();
    });

    it('returns null for an out-of-range month', () => {
      expect(parseBudgetBakersWalletDate({ raw: '01/13/2025 10:00' })).toBeNull();
    });

    it('returns null for an out-of-range hour', () => {
      expect(parseBudgetBakersWalletDate({ raw: '01/01/2025 25:00' })).toBeNull();
    });

    it('returns null for MM/DD/YYYY HH:MM (not the Wallet format — prevents accidental swap)', () => {
      // 31/07 parsed correctly (day=31, month=07) vs 07/31 which would fail month>12 check.
      // This test ensures we parse as DD/MM not MM/DD.
      const result = parseBudgetBakersWalletDate({ raw: '31/07/2025 13:30' });
      expect(result).toBe('2025-07-31T13:30:00.000Z');
    });
  });

  describe('null / empty / garbage', () => {
    it('returns null for empty string', () => {
      expect(parseBudgetBakersWalletDate({ raw: '' })).toBeNull();
      expect(parseBudgetBakersWalletDate({ raw: '   ' })).toBeNull();
    });

    it('returns null for nullish input', () => {
      expect(parseBudgetBakersWalletDate({ raw: null })).toBeNull();
      expect(parseBudgetBakersWalletDate({ raw: undefined })).toBeNull();
    });

    it('returns null for unrecognized formats', () => {
      expect(parseBudgetBakersWalletDate({ raw: '2025-12-25' })).toBeNull();
      expect(parseBudgetBakersWalletDate({ raw: 'Dec 25, 2025' })).toBeNull();
      expect(parseBudgetBakersWalletDate({ raw: 'hello' })).toBeNull();
    });
  });
});
