import { describe, expect, it } from 'vitest';

import { getDemoExpiresAt, getDemoTimeRemaining } from './demo-expiry';

const HOUR = 60 * 60 * 1000;
const MINUTE = 60 * 1000;

describe('getDemoExpiresAt', () => {
  it('returns createdAt + 4h for a demo user', () => {
    const createdAt = new Date('2026-07-01T00:00:00.000Z');

    expect(getDemoExpiresAt({ user: { role: 'demo', createdAt } })).toBe(createdAt.getTime() + 4 * HOUR);
  });

  it('returns null for a non-demo user (no expiry at all)', () => {
    const createdAt = new Date('2026-07-01T00:00:00.000Z');

    expect(getDemoExpiresAt({ user: { role: 'common', createdAt } })).toBeNull();
  });

  it('returns null when there is no user', () => {
    expect(getDemoExpiresAt({ user: null })).toBeNull();
    expect(getDemoExpiresAt({ user: undefined })).toBeNull();
  });
});

describe('getDemoTimeRemaining', () => {
  it('returns hours/minutes when not yet expired', () => {
    const now = 0;
    const expiresAt = 2 * HOUR + 30 * MINUTE;

    expect(getDemoTimeRemaining({ expiresAt, now })).toEqual({ hours: 2, minutes: 30 });
  });

  it('returns null exactly at the expiry instant', () => {
    const expiresAt = 5 * HOUR;
    const now = 5 * HOUR;

    expect(getDemoTimeRemaining({ expiresAt, now })).toBeNull();
  });

  it('returns null once past expiry', () => {
    const expiresAt = 5 * HOUR;
    const now = 5 * HOUR + 1;

    expect(getDemoTimeRemaining({ expiresAt, now })).toBeNull();
  });

  it('returns null when there is no expiry at all', () => {
    expect(getDemoTimeRemaining({ expiresAt: null, now: 0 })).toBeNull();
  });
});
