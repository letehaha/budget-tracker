import { describe, expect, it } from '@jest/globals';

import { minutesToCronExpression } from './minutes-to-cron';

describe('minutesToCronExpression', () => {
  describe('sub-hour cadence (1..59 minutes)', () => {
    it.each([
      [1, '*/1 * * * *'],
      [2, '*/2 * * * *'],
      [5, '*/5 * * * *'],
      [10, '*/10 * * * *'],
      [15, '*/15 * * * *'],
      [20, '*/20 * * * *'],
      [30, '*/30 * * * *'],
      [45, '*/45 * * * *'],
      [59, '*/59 * * * *'],
    ])('maps %d minutes to %s', (minutes, expected) => {
      expect(minutesToCronExpression({ minutes })).toBe(expected);
    });

    it('accepts non-divisors of 60 (caller accepts the boundary gap)', () => {
      // `*/7` is non-uniform at the hour boundary, but cron accepts the form
      // and rejecting it would surprise users who configure 7-minute polling.
      expect(minutesToCronExpression({ minutes: 7 })).toBe('*/7 * * * *');
      expect(minutesToCronExpression({ minutes: 13 })).toBe('*/13 * * * *');
    });
  });

  describe('hour-aligned cadence', () => {
    it('maps 60 minutes to the top of every hour', () => {
      expect(minutesToCronExpression({ minutes: 60 })).toBe('0 */1 * * *');
    });

    it.each([
      [120, '0 */2 * * *'],
      [180, '0 */3 * * *'],
      [240, '0 */4 * * *'],
      [360, '0 */6 * * *'],
      [720, '0 */12 * * *'],
      [1380, '0 */23 * * *'],
    ])('maps %d minutes to %s', (minutes, expected) => {
      expect(minutesToCronExpression({ minutes })).toBe(expected);
    });
  });

  describe('daily cadence', () => {
    it('maps 1440 minutes to midnight every day', () => {
      expect(minutesToCronExpression({ minutes: 1440 })).toBe('0 0 * * *');
    });
  });

  describe('invalid input', () => {
    it.each([
      ['zero', 0],
      ['negative', -15],
      ['NaN', Number.NaN],
      ['Infinity', Number.POSITIVE_INFINITY],
      ['fractional', 15.5],
    ])('returns null for %s', (_label, minutes) => {
      expect(minutesToCronExpression({ minutes })).toBeNull();
    });

    it('returns null for multiples of 60 above one day', () => {
      // Cron can't express "every 25 hours" as a single uniform schedule.
      expect(minutesToCronExpression({ minutes: 1500 })).toBeNull();
      expect(minutesToCronExpression({ minutes: 3600 })).toBeNull();
    });

    it('returns null for above-an-hour values that are not multiples of 60', () => {
      // "every 90 minutes" wraps the hour irregularly — no single cron
      // expression captures it.
      expect(minutesToCronExpression({ minutes: 90 })).toBeNull();
      expect(minutesToCronExpression({ minutes: 100 })).toBeNull();
      expect(minutesToCronExpression({ minutes: 125 })).toBeNull();
    });
  });
});
