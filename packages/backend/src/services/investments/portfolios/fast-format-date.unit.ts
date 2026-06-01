import { fastFormatDate } from './get-portfolios-annualized-returns.service';

describe('fastFormatDate', () => {
  describe('Date input', () => {
    it('formats a standard mid-year UTC date', () => {
      expect(fastFormatDate(new Date('2025-06-15T12:34:56Z'))).toBe('2025-06-15');
    });

    it('zero-pads single-digit months', () => {
      expect(fastFormatDate(new Date('2025-01-15T00:00:00Z'))).toBe('2025-01-15');
      expect(fastFormatDate(new Date('2025-09-15T00:00:00Z'))).toBe('2025-09-15');
    });

    it('zero-pads single-digit days', () => {
      expect(fastFormatDate(new Date('2025-06-01T00:00:00Z'))).toBe('2025-06-01');
      expect(fastFormatDate(new Date('2025-06-09T00:00:00Z'))).toBe('2025-06-09');
    });

    it('zero-pads single-digit month AND day together', () => {
      expect(fastFormatDate(new Date('2025-01-01T00:00:00Z'))).toBe('2025-01-01');
      expect(fastFormatDate(new Date('2025-09-09T00:00:00Z'))).toBe('2025-09-09');
    });

    it('uses UTC, not local timezone', () => {
      // 2025-01-15 at 23:30 UTC is 2025-01-16 in tz=+02:00 (and 2025-01-15 in
      // tz=-05:00). The helper must return the UTC calendar day regardless of
      // the host TZ — otherwise rate/price keys disagree across deploys.
      expect(fastFormatDate(new Date('2025-01-15T23:30:00Z'))).toBe('2025-01-15');
      expect(fastFormatDate(new Date('2025-01-16T00:30:00Z'))).toBe('2025-01-16');
    });

    it('handles the last day of the year', () => {
      expect(fastFormatDate(new Date('2025-12-31T23:59:59Z'))).toBe('2025-12-31');
    });

    it('handles the first day of the year', () => {
      expect(fastFormatDate(new Date('2025-01-01T00:00:00Z'))).toBe('2025-01-01');
    });

    it('handles a leap-day', () => {
      expect(fastFormatDate(new Date('2024-02-29T00:00:00Z'))).toBe('2024-02-29');
    });

    it('handles a four-digit year far in the past', () => {
      expect(fastFormatDate(new Date('1999-12-31T00:00:00Z'))).toBe('1999-12-31');
    });

    it('handles a four-digit year far in the future', () => {
      expect(fastFormatDate(new Date('2999-07-04T00:00:00Z'))).toBe('2999-07-04');
    });
  });

  describe('string input', () => {
    it('slices an ISO timestamp to YYYY-MM-DD', () => {
      expect(fastFormatDate('2025-01-15T00:00:00.000Z')).toBe('2025-01-15');
      expect(fastFormatDate('2025-12-31T23:59:59Z')).toBe('2025-12-31');
    });

    it('returns an already-formatted YYYY-MM-DD string unchanged', () => {
      expect(fastFormatDate('2025-06-15')).toBe('2025-06-15');
    });

    it('slices any string at least 10 chars long', () => {
      // The helper does not validate format — it trusts the caller passes
      // either an ISO-shaped timestamp or a YYYY-MM-DD value (both start with
      // 10 chars of date). Anything longer is sliced to the first 10 chars.
      expect(fastFormatDate('2025-06-15extra')).toBe('2025-06-15');
    });

    it('returns a short string unchanged (defensive edge case)', () => {
      expect(fastFormatDate('')).toBe('');
      expect(fastFormatDate('2025-06')).toBe('2025-06');
    });
  });

  describe('parity with format(date, "yyyy-MM-dd")', () => {
    // Sanity check that the fast path matches the previous `date-fns` output
    // for UTC-aligned inputs (the production case). Spot-checks across the
    // boundaries that single-digit padding logic touches.
    const cases: Array<{ iso: string; expected: string }> = [
      { iso: '2025-01-01T00:00:00Z', expected: '2025-01-01' },
      { iso: '2025-01-15T00:00:00Z', expected: '2025-01-15' },
      { iso: '2025-10-15T00:00:00Z', expected: '2025-10-15' },
      { iso: '2025-10-09T00:00:00Z', expected: '2025-10-09' },
      { iso: '2025-12-31T00:00:00Z', expected: '2025-12-31' },
    ];

    it.each(cases)('formats $iso as $expected', ({ iso, expected }) => {
      expect(fastFormatDate(new Date(iso))).toBe(expected);
    });
  });
});
