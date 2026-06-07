import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/sentry', () => ({
  captureException: vi.fn(),
  addBreadcrumb: vi.fn(),
}));

import { addBreadcrumb, captureException } from '@/lib/sentry';

import { installChunkReloadHandler, readCounter, reloadWithGuard } from './chunk-reload-handler';

const captureExceptionMock = vi.mocked(captureException);
const addBreadcrumbMock = vi.mocked(addBreadcrumb);

const RELOAD_COUNTER_KEY = 'app:chunk-reload-attempts';
const RELOAD_TIMESTAMP_KEY = 'app:chunk-reload-timestamp';

describe('chunk-reload-handler', () => {
  let reloadMock: ReturnType<typeof vi.fn>;
  let originalLocation: Location;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T00:00:00Z'));
    window.sessionStorage.clear();
    captureExceptionMock.mockClear();
    addBreadcrumbMock.mockClear();

    originalLocation = window.location;
    reloadMock = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, reload: reloadMock },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
    vi.useRealTimers();
  });

  describe('readCounter', () => {
    it('returns 0 when no key has been set', () => {
      expect(readCounter()).toBe(0);
    });

    it('returns the stored value within the reset window', () => {
      window.sessionStorage.setItem(RELOAD_COUNTER_KEY, '1');
      window.sessionStorage.setItem(RELOAD_TIMESTAMP_KEY, String(Date.now()));
      expect(readCounter()).toBe(1);
    });

    it('resets to 0 after COUNTER_RESET_AFTER_MS has elapsed', () => {
      window.sessionStorage.setItem(RELOAD_COUNTER_KEY, '2');
      window.sessionStorage.setItem(RELOAD_TIMESTAMP_KEY, String(Date.now() - 61_000));
      expect(readCounter()).toBe(0);
    });
  });

  describe('reloadWithGuard', () => {
    const error = new TypeError('Failed to fetch dynamically imported module');

    it('triggers reload on the first call and returns true', () => {
      const result = reloadWithGuard(error);
      expect(result).toBe(true);
      expect(reloadMock).toHaveBeenCalledOnce();
      expect(captureExceptionMock).not.toHaveBeenCalled();
    });

    it('reloads up to MAX_RELOAD_ATTEMPTS within the reset window', () => {
      expect(reloadWithGuard(error)).toBe(true);
      expect(reloadWithGuard(error)).toBe(true);
      expect(reloadMock).toHaveBeenCalledTimes(2);
      expect(captureExceptionMock).not.toHaveBeenCalled();
    });

    it('returns false and captures the exception once the cap is reached', () => {
      reloadWithGuard(error);
      reloadWithGuard(error);
      reloadMock.mockClear();

      const result = reloadWithGuard(error);

      expect(result).toBe(false);
      expect(reloadMock).not.toHaveBeenCalled();
      expect(captureExceptionMock).toHaveBeenCalledWith({
        error,
        context: { reason: 'chunk-reload-cap-exhausted', attempts: 2 },
      });
    });

    it('rolls the counter forward after the reset window so a new burst can reload again', () => {
      reloadWithGuard(error);
      reloadWithGuard(error);
      reloadMock.mockClear();

      vi.setSystemTime(Date.now() + 61_000);

      const result = reloadWithGuard(error);
      expect(result).toBe(true);
      expect(reloadMock).toHaveBeenCalledOnce();
    });
  });

  describe('installChunkReloadHandler', () => {
    const captureHandler = () => {
      const spy = vi.spyOn(window, 'addEventListener');
      installChunkReloadHandler();
      const call = spy.mock.calls.find(([event]) => event === 'vite:preloadError');
      spy.mockRestore();
      if (!call) throw new Error('vite:preloadError listener was not registered');
      return call[1] as EventListener;
    };

    const makeEvent = (error: Error) => {
      const event = new Event('vite:preloadError', { cancelable: true });
      Object.defineProperty(event, 'payload', { value: error });
      return event;
    };

    it('reloads and calls preventDefault on a preload error', () => {
      const handler = captureHandler();
      const event = makeEvent(new TypeError('boom'));

      handler(event);

      expect(reloadMock).toHaveBeenCalledOnce();
      expect(event.defaultPrevented).toBe(true);
      expect(addBreadcrumbMock).toHaveBeenCalledWith(expect.objectContaining({ category: 'chunk-reload' }));
    });

    it('does NOT call preventDefault when the reload cap is reached', () => {
      const handler = captureHandler();

      handler(makeEvent(new TypeError('boom')));
      handler(makeEvent(new TypeError('boom')));
      reloadMock.mockClear();
      captureExceptionMock.mockClear();

      const event = makeEvent(new TypeError('boom'));
      handler(event);

      expect(reloadMock).not.toHaveBeenCalled();
      expect(event.defaultPrevented).toBe(false);
      expect(captureExceptionMock).toHaveBeenCalledOnce();
    });
  });
});
