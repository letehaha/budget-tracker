import { describe, expect, it } from '@jest/globals';

import { isOnOrAfterAnchorDay, utcDayKey } from './anchor-day';

describe('utcDayKey', () => {
  it('returns the UTC calendar day for a timestamp just before UTC midnight', () => {
    expect(utcDayKey({ date: new Date('2026-07-02T23:30:00Z') })).toBe('2026-07-02');
  });

  it('returns the UTC calendar day for a timestamp just after UTC midnight', () => {
    expect(utcDayKey({ date: new Date('2026-07-03T00:30:00Z') })).toBe('2026-07-03');
  });

  it('accepts ISO strings and Date objects interchangeably', () => {
    expect(utcDayKey({ date: '2026-07-02T23:59:59.999Z' })).toBe('2026-07-02');
    expect(utcDayKey({ date: new Date('2026-07-03T00:00:00.000Z') })).toBe('2026-07-03');
  });

  it('normalizes offset timestamps to their UTC day', () => {
    // 01:30 at UTC+3 on Jul 3 is 22:30 UTC on Jul 2.
    expect(utcDayKey({ date: '2026-07-03T01:30:00+03:00' })).toBe('2026-07-02');
  });
});

describe('isOnOrAfterAnchorDay', () => {
  const anchorDate = '2026-07-03';

  it('classifies a leg 30 minutes before UTC midnight as the previous day (pre-anchor)', () => {
    expect(isOnOrAfterAnchorDay({ time: '2026-07-02T23:30:00Z', anchorDate })).toBe(false);
  });

  it('classifies a leg 30 minutes after UTC midnight as on the anchor day (counted)', () => {
    expect(isOnOrAfterAnchorDay({ time: '2026-07-03T00:30:00Z', anchorDate })).toBe(true);
  });

  it('treats the anchor-day boundary as inclusive at exactly UTC midnight', () => {
    expect(isOnOrAfterAnchorDay({ time: '2026-07-03T00:00:00.000Z', anchorDate })).toBe(true);
  });

  it('counts legs dated after the anchor day', () => {
    expect(isOnOrAfterAnchorDay({ time: new Date('2026-08-01T12:00:00Z'), anchorDate })).toBe(true);
  });
});
