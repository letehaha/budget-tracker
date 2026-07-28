import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { consumeDemoOriginProperties, hasSignedInOnDevice, markDemoOrigin, markSignedInOnDevice } from './demo-origin';

const DEMO_ORIGIN_KEY = 'demo-origin';
const HOUR_MS = 60 * 60 * 1000;

describe('demo-origin', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('markDemoOrigin', () => {
    it('stores the reason and the current time', () => {
      markDemoOrigin({ reason: 'signup_clicked' });

      expect(JSON.parse(localStorage.getItem(DEMO_ORIGIN_KEY)!)).toEqual({
        endedAt: Date.now(),
        reason: 'signup_clicked',
      });
    });

    it('overwrites a previous breadcrumb', () => {
      markDemoOrigin({ reason: 'expired' });
      markDemoOrigin({ reason: 'logout' });

      expect(JSON.parse(localStorage.getItem(DEMO_ORIGIN_KEY)!).reason).toBe('logout');
    });
  });

  describe('consumeDemoOriginProperties', () => {
    it('returns attribution properties for a first sign-in on the device', () => {
      markDemoOrigin({ reason: 'signup_clicked' });
      vi.advanceTimersByTime(7 * 60 * 1000);

      expect(consumeDemoOriginProperties({ isFirstSignInOnDevice: true })).toEqual({
        came_from_demo: true,
        demo_end_reason: 'signup_clicked',
        minutes_since_demo: 7,
      });
    });

    it('returns nothing when no demo preceded the sign-in', () => {
      expect(consumeDemoOriginProperties({ isFirstSignInOnDevice: true })).toEqual({});
    });

    it('clears the breadcrumb so a later sign-in is not attributed again', () => {
      markDemoOrigin({ reason: 'logout' });

      expect(consumeDemoOriginProperties({ isFirstSignInOnDevice: true })).not.toEqual({});
      expect(consumeDemoOriginProperties({ isFirstSignInOnDevice: true })).toEqual({});
      expect(localStorage.getItem(DEMO_ORIGIN_KEY)).toBeNull();
    });

    it('does not attribute an account already used on this device, but still clears the breadcrumb', () => {
      markDemoOrigin({ reason: 'logout' });

      expect(consumeDemoOriginProperties({ isFirstSignInOnDevice: false })).toEqual({});
      expect(localStorage.getItem(DEMO_ORIGIN_KEY)).toBeNull();
    });

    it('ignores a demo that ended longer ago than the attribution window', () => {
      markDemoOrigin({ reason: 'expired' });
      vi.advanceTimersByTime(25 * HOUR_MS);

      expect(consumeDemoOriginProperties({ isFirstSignInOnDevice: true })).toEqual({});
    });

    it('attributes a demo that ended just inside the attribution window', () => {
      markDemoOrigin({ reason: 'expired' });
      vi.advanceTimersByTime(23 * HOUR_MS);

      expect(consumeDemoOriginProperties({ isFirstSignInOnDevice: true })).toMatchObject({
        came_from_demo: true,
        minutes_since_demo: 23 * 60,
      });
    });

    it('ignores a breadcrumb timestamped in the future', () => {
      localStorage.setItem(DEMO_ORIGIN_KEY, JSON.stringify({ endedAt: Date.now() + HOUR_MS, reason: 'logout' }));

      expect(consumeDemoOriginProperties({ isFirstSignInOnDevice: true })).toEqual({});
    });

    it('ignores malformed breadcrumbs', () => {
      localStorage.setItem(DEMO_ORIGIN_KEY, 'not json');

      expect(consumeDemoOriginProperties({ isFirstSignInOnDevice: true })).toEqual({});
      expect(localStorage.getItem(DEMO_ORIGIN_KEY)).toBeNull();
    });

    it('ignores a breadcrumb with no usable timestamp', () => {
      localStorage.setItem(DEMO_ORIGIN_KEY, JSON.stringify({ reason: 'logout' }));

      expect(consumeDemoOriginProperties({ isFirstSignInOnDevice: true })).toEqual({});
    });
  });

  describe('device sign-in flag', () => {
    it('reports nothing until a non-demo sign-in is marked', () => {
      expect(hasSignedInOnDevice()).toBe(false);

      markSignedInOnDevice();

      expect(hasSignedInOnDevice()).toBe(true);
    });
  });

  // Callers are logout and sign-in, so a throwing storage must not propagate out of here.
  describe('when localStorage throws', () => {
    const quotaError = () => {
      throw new DOMException('quota exceeded', 'QuotaExceededError');
    };

    it('the device flag reads as unset and marking it does not throw', () => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(quotaError);
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(quotaError);

      expect(() => markSignedInOnDevice()).not.toThrow();
      expect(hasSignedInOnDevice()).toBe(false);
    });

    it('markDemoOrigin swallows a failed write', () => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(quotaError);

      expect(() => markDemoOrigin({ reason: 'logout' })).not.toThrow();
    });

    it('consumeDemoOriginProperties returns nothing when the read throws', () => {
      markDemoOrigin({ reason: 'logout' });
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(quotaError);

      expect(consumeDemoOriginProperties({ isFirstSignInOnDevice: true })).toEqual({});
    });

    it('consumeDemoOriginProperties still attributes when clearing the breadcrumb throws', () => {
      markDemoOrigin({ reason: 'signup_clicked' });
      vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(quotaError);

      expect(consumeDemoOriginProperties({ isFirstSignInOnDevice: true })).toMatchObject({
        came_from_demo: true,
        demo_end_reason: 'signup_clicked',
      });
    });
  });
});
