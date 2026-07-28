// These two helpers decide the open period's due date for every demo
// subscription. No configured demo subscription uses a dayOfMonth above 25, so
// the short-month clamp only ever runs here.

import { describe, expect, it, jest } from '@jest/globals';
import { format } from 'date-fns';

// Blocks the real module, whose import chain builds a BullMQ queue and worker at
// module scope and would open Redis connections in a unit test.
jest.mock('@services/subscriptions/create-subscription', () => ({
  createSubscription: jest.fn(),
}));

import { clampDayToMonth, nextOccurrenceAfter } from './seed-subscriptions.service';

const iso = (date: Date) => format(date, 'yyyy-MM-dd');

describe('clampDayToMonth', () => {
  it('keeps the day when the month is long enough', () => {
    expect(iso(clampDayToMonth({ month: new Date(2026, 0, 5), dayOfMonth: 15 }))).toBe('2026-01-15');
  });

  it('keeps the day on the exact last day of the month', () => {
    expect(iso(clampDayToMonth({ month: new Date(2026, 0, 5), dayOfMonth: 31 }))).toBe('2026-01-31');
  });

  it('clamps day 31 into a 30-day month', () => {
    expect(iso(clampDayToMonth({ month: new Date(2026, 3, 5), dayOfMonth: 31 }))).toBe('2026-04-30');
  });

  it('clamps day 29-31 into a non-leap February', () => {
    const february = new Date(2026, 1, 5);
    expect(iso(clampDayToMonth({ month: february, dayOfMonth: 29 }))).toBe('2026-02-28');
    expect(iso(clampDayToMonth({ month: february, dayOfMonth: 30 }))).toBe('2026-02-28');
    expect(iso(clampDayToMonth({ month: february, dayOfMonth: 31 }))).toBe('2026-02-28');
  });

  it('allows day 29 in a leap February', () => {
    expect(iso(clampDayToMonth({ month: new Date(2024, 1, 5), dayOfMonth: 29 }))).toBe('2024-02-29');
  });

  it('preserves the time of day of the reference month', () => {
    const result = clampDayToMonth({ month: new Date(2026, 3, 5, 13, 45, 30), dayOfMonth: 31 });
    expect(result.getHours()).toBe(13);
    expect(result.getMinutes()).toBe(45);
  });
});

describe('nextOccurrenceAfter', () => {
  it('returns this month when the day is still ahead', () => {
    const result = nextOccurrenceAfter({ referenceDate: new Date(2026, 5, 10), dayOfMonth: 20 });
    expect(iso(result)).toBe('2026-06-20');
  });

  it('rolls into next month when the day already passed', () => {
    const result = nextOccurrenceAfter({ referenceDate: new Date(2026, 5, 25), dayOfMonth: 20 });
    expect(iso(result)).toBe('2026-07-20');
  });

  it('rolls into next month when the day is exactly today', () => {
    const result = nextOccurrenceAfter({ referenceDate: new Date(2026, 5, 20), dayOfMonth: 20 });
    expect(iso(result)).toBe('2026-07-20');
  });

  it('treats the day as passed regardless of the time of day', () => {
    const lateInTheDay = nextOccurrenceAfter({ referenceDate: new Date(2026, 5, 20, 23, 59), dayOfMonth: 20 });
    const earlyInTheDay = nextOccurrenceAfter({ referenceDate: new Date(2026, 5, 20, 0, 1), dayOfMonth: 20 });
    expect(iso(lateInTheDay)).toBe('2026-07-20');
    expect(iso(earlyInTheDay)).toBe('2026-07-20');
  });

  it('clamps into the next month when that month is shorter', () => {
    // 31 Jan is already past, and February has no 31st.
    const result = nextOccurrenceAfter({ referenceDate: new Date(2026, 0, 31), dayOfMonth: 31 });
    expect(iso(result)).toBe('2026-02-28');
  });

  it('clamps within the current month and then rolls forward when that lands in the past', () => {
    // Day 31 clamps to 30 Apr, which is not after 30 Apr, so it must roll to May.
    const result = nextOccurrenceAfter({ referenceDate: new Date(2026, 3, 30), dayOfMonth: 31 });
    expect(iso(result)).toBe('2026-05-31');
  });

  it('returns the clamped last day of the current month when it is still ahead', () => {
    const result = nextOccurrenceAfter({ referenceDate: new Date(2026, 3, 10), dayOfMonth: 31 });
    expect(iso(result)).toBe('2026-04-30');
  });

  it('rolls from December into January of the next year', () => {
    const result = nextOccurrenceAfter({ referenceDate: new Date(2026, 11, 20), dayOfMonth: 15 });
    expect(iso(result)).toBe('2027-01-15');
  });
});
