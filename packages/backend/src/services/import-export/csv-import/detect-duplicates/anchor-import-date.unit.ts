import { describe, expect, it } from '@jest/globals';

import { anchorImportDate } from './anchor-import-date';
import { type ParsedImportDate } from './date-engine';

describe('anchorImportDate', () => {
  describe('instant', () => {
    it('preserves an absolute moment exactly, regardless of timezone', () => {
      const parsed: ParsedImportDate = { kind: 'instant', instant: new Date('2026-06-16T18:17:19.587Z') };

      expect(anchorImportDate({ parsed, timezone: 'America/Montevideo' }).toISOString()).toBe(
        '2026-06-16T18:17:19.587Z',
      );
      expect(anchorImportDate({ parsed, timezone: 'Asia/Tokyo' }).toISOString()).toBe('2026-06-16T18:17:19.587Z');
      expect(anchorImportDate({ parsed, timezone: undefined }).toISOString()).toBe('2026-06-16T18:17:19.587Z');
    });
  });

  describe('dateOnly', () => {
    it('anchors to local noon in the given timezone (UTC-3 stays the same calendar day)', () => {
      const parsed: ParsedImportDate = { kind: 'dateOnly', year: 2026, month: 6, day: 1 };

      // Local noon in Montevideo (UTC-3) is 15:00 UTC — same calendar day.
      const instant = anchorImportDate({ parsed, timezone: 'America/Montevideo' });
      expect(instant.toISOString()).toBe('2026-06-01T15:00:00.000Z');
    });

    it('does not slip a day for a UTC-3 viewer (the off-by-one regression)', () => {
      const parsed: ParsedImportDate = { kind: 'dateOnly', year: 2026, month: 6, day: 1 };
      const instant = anchorImportDate({ parsed, timezone: 'America/Montevideo' });

      // The day as seen by the UTC-3 user must still be June 1, never May 31.
      const dayForUser = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Montevideo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(instant);
      expect(dayForUser).toBe('2026-06-01');
    });

    it('anchors to local noon for a UTC+ timezone (calendar day preserved)', () => {
      const parsed: ParsedImportDate = { kind: 'dateOnly', year: 2026, month: 6, day: 8 };

      // Tokyo is UTC+9, so local noon is 03:00 UTC — still June 8.
      const instant = anchorImportDate({ parsed, timezone: 'Asia/Tokyo' });
      expect(instant.toISOString()).toBe('2026-06-08T03:00:00.000Z');
      expect(instant.toISOString().split('T')[0]).toBe('2026-06-08');
    });

    it('falls back to UTC noon when the timezone is missing', () => {
      const parsed: ParsedImportDate = { kind: 'dateOnly', year: 2026, month: 6, day: 1 };
      const instant = anchorImportDate({ parsed, timezone: undefined });
      expect(instant.toISOString()).toBe('2026-06-01T12:00:00.000Z');
    });

    it('falls back to UTC noon when the timezone is invalid (does not crash)', () => {
      const parsed: ParsedImportDate = { kind: 'dateOnly', year: 2026, month: 6, day: 1 };
      const instant = anchorImportDate({ parsed, timezone: 'Not/AZone' });
      expect(instant.toISOString()).toBe('2026-06-01T12:00:00.000Z');
    });
  });

  describe('localDateTime', () => {
    it('interprets wall-clock components in the given timezone', () => {
      const parsed: ParsedImportDate = {
        kind: 'localDateTime',
        year: 2026,
        month: 6,
        day: 1,
        hour: 9,
        minute: 30,
        second: 15,
        ms: 0,
      };

      // 09:30:15 in Montevideo (UTC-3) is 12:30:15 UTC.
      const instant = anchorImportDate({ parsed, timezone: 'America/Montevideo' });
      expect(instant.toISOString()).toBe('2026-06-01T12:30:15.000Z');
    });

    it('preserves milliseconds', () => {
      const parsed: ParsedImportDate = {
        kind: 'localDateTime',
        year: 2026,
        month: 6,
        day: 16,
        hour: 18,
        minute: 17,
        second: 19,
        ms: 587,
      };
      const instant = anchorImportDate({ parsed, timezone: 'Asia/Tokyo' });
      // Tokyo UTC+9: 18:17:19.587 local -> 09:17:19.587 UTC.
      expect(instant.toISOString()).toBe('2026-06-16T09:17:19.587Z');
    });

    it('treats wall-clock components as UTC when the timezone is missing', () => {
      const parsed: ParsedImportDate = {
        kind: 'localDateTime',
        year: 2026,
        month: 6,
        day: 1,
        hour: 9,
        minute: 30,
        second: 0,
        ms: 0,
      };
      const instant = anchorImportDate({ parsed, timezone: undefined });
      expect(instant.toISOString()).toBe('2026-06-01T09:30:00.000Z');
    });

    it('treats wall-clock components as UTC when the timezone is invalid', () => {
      const parsed: ParsedImportDate = {
        kind: 'localDateTime',
        year: 2026,
        month: 6,
        day: 1,
        hour: 9,
        minute: 30,
        second: 0,
        ms: 0,
      };
      const instant = anchorImportDate({ parsed, timezone: 'Not/AZone' });
      expect(instant.toISOString()).toBe('2026-06-01T09:30:00.000Z');
    });

    it('resolves a wall-clock time inside the DST spring-forward gap without crashing (America/New_York, 2026-03-08T02:30)', () => {
      // America/New_York springs forward at 02:00 on 2026-03-08, jumping
      // directly to 03:00 — 02:30 is a nonexistent wall-clock time.
      //
      // The two-pass offset correction in zonedWallClockToInstant re-samples the
      // offset at the corrected instant, which settles it to the post-gap side
      // (EDT, UTC-4). The result must be a valid Date — not NaN, not a throw.
      //
      // Before DST: 02:29 EST (UTC-5) → 07:29 UTC
      // After  DST: 03:00 EDT (UTC-4) → 07:00 UTC
      // The nonexistent 02:30 lands on the post-gap side: EDT (UTC-4)
      //   utcGuess = Date.UTC(2026, 2, 8, 2, 30) = 2026-03-08T02:30Z
      //   first offset: sampling at 02:30 UTC, NY is already on EDT → offset = -4h = -14400000ms
      //   corrected guess: 02:30Z - (-14400000ms) = 06:30Z
      //   second offset: sampling at 06:30Z, NY is EDT → offset = -4h
      //   result = 02:30Z - (-14400000ms) = 06:30 UTC
      const parsed: ParsedImportDate = {
        kind: 'localDateTime',
        year: 2026,
        month: 3,
        day: 8,
        hour: 2,
        minute: 30,
        second: 0,
        ms: 0,
      };

      const instant = anchorImportDate({ parsed, timezone: 'America/New_York' });

      // Must produce a real Date (not NaN/invalid).
      expect(Number.isNaN(instant.getTime())).toBe(false);

      // The result must be on 2026-03-08 as seen from New York (UTC-4 post-gap).
      const dayInNY = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/New_York',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(instant);
      expect(dayInNY).toBe('2026-03-08');

      // The two-pass correction must produce 06:30 UTC (resolved to post-gap EDT).
      expect(instant.toISOString()).toBe('2026-03-08T06:30:00.000Z');
    });
  });
});
