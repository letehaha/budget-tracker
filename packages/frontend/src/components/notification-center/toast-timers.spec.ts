import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { toast } from 'vue-sonner';

import { holdToastTimers, registerToast, releaseToastTimers, unregisterToast } from './toast-timers';

vi.mock('vue-sonner', () => ({ toast: { dismiss: vi.fn() } }));

const DURATION_MS = 4000;

const dismiss = vi.mocked(toast.dismiss);
const registeredIds = new Set<string>();

const register = ({ id, durationMs, onExpire }: { id: string; durationMs: number; onExpire?: () => void }) => {
  registeredIds.add(id);
  registerToast({ id, durationMs, onExpire });
};

beforeEach(() => {
  vi.useFakeTimers();
});

// The registry is module state that outlives a test, so anything it may still hold is dropped here.
afterEach(() => {
  registeredIds.forEach((id) => unregisterToast({ id }));
  registeredIds.clear();
  releaseToastTimers();
  vi.useRealTimers();
  dismiss.mockClear();
});

describe('toast timers registry', () => {
  test('dismisses a registered toast once its duration elapses', () => {
    register({ id: 'a', durationMs: DURATION_MS });

    vi.advanceTimersByTime(DURATION_MS - 1);
    expect(dismiss).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(dismiss).toHaveBeenCalledExactlyOnceWith('a');
  });

  test('does not count down while held and starts full on release', () => {
    holdToastTimers();
    register({ id: 'a', durationMs: DURATION_MS });

    vi.advanceTimersByTime(DURATION_MS * 10);
    expect(dismiss).not.toHaveBeenCalled();

    releaseToastTimers();

    vi.advanceTimersByTime(DURATION_MS - 1);
    expect(dismiss).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(dismiss).toHaveBeenCalledExactlyOnceWith('a');
  });

  test('a hold mid-countdown resets the duration instead of resuming it', () => {
    register({ id: 'a', durationMs: DURATION_MS });
    vi.advanceTimersByTime(DURATION_MS - 500);

    holdToastTimers();
    vi.advanceTimersByTime(DURATION_MS * 10);
    expect(dismiss).not.toHaveBeenCalled();

    releaseToastTimers();
    vi.advanceTimersByTime(DURATION_MS - 1);
    expect(dismiss).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(dismiss).toHaveBeenCalledExactlyOnceWith('a');
  });

  test('re-registering an id restarts it from full and leaves a single timer', () => {
    register({ id: 'a', durationMs: DURATION_MS });
    vi.advanceTimersByTime(DURATION_MS - 500);

    register({ id: 'a', durationMs: DURATION_MS });
    vi.advanceTimersByTime(DURATION_MS - 1);
    expect(dismiss).not.toHaveBeenCalled();

    vi.advanceTimersByTime(DURATION_MS);
    expect(dismiss).toHaveBeenCalledExactlyOnceWith('a');
  });

  test('holds and releases every registered toast', () => {
    register({ id: 'a', durationMs: DURATION_MS });
    register({ id: 'b', durationMs: DURATION_MS * 2 });

    holdToastTimers();
    vi.advanceTimersByTime(DURATION_MS * 10);
    expect(dismiss).not.toHaveBeenCalled();

    releaseToastTimers();
    vi.advanceTimersByTime(DURATION_MS);
    expect(dismiss.mock.calls).toEqual([['a']]);

    vi.advanceTimersByTime(DURATION_MS);
    expect(dismiss.mock.calls).toEqual([['a'], ['b']]);
  });

  test('never fires for a toast that was unregistered', () => {
    register({ id: 'a', durationMs: DURATION_MS });
    vi.advanceTimersByTime(DURATION_MS - 1);

    unregisterToast({ id: 'a' });
    vi.advanceTimersByTime(DURATION_MS * 10);
    expect(dismiss).not.toHaveBeenCalled();
  });

  test('unregistering during a hold survives the release', () => {
    register({ id: 'a', durationMs: DURATION_MS });
    holdToastTimers();
    unregisterToast({ id: 'a' });
    releaseToastTimers();

    vi.advanceTimersByTime(DURATION_MS * 10);
    expect(dismiss).not.toHaveBeenCalled();
  });

  test('repeated holds and releases stay consistent', () => {
    register({ id: 'a', durationMs: DURATION_MS });
    holdToastTimers();
    holdToastTimers();

    vi.advanceTimersByTime(DURATION_MS * 10);
    expect(dismiss).not.toHaveBeenCalled();

    releaseToastTimers();
    vi.advanceTimersByTime(DURATION_MS - 500);
    releaseToastTimers();

    vi.advanceTimersByTime(DURATION_MS - 1);
    expect(dismiss).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(dismiss).toHaveBeenCalledExactlyOnceWith('a');
  });

  test('ignores unknown ids and an empty registry', () => {
    expect(() => unregisterToast({ id: 'ghost' })).not.toThrow();
    holdToastTimers();
    releaseToastTimers();

    vi.advanceTimersByTime(DURATION_MS * 10);
    expect(dismiss).not.toHaveBeenCalled();
  });

  test('reports an expiry to the caller before dismissing', () => {
    const onExpire = vi.fn();
    register({ id: 'a', durationMs: DURATION_MS, onExpire });

    vi.advanceTimersByTime(DURATION_MS);

    expect(onExpire).toHaveBeenCalledOnce();
    expect(onExpire.mock.invocationCallOrder[0]).toBeLessThan(dismiss.mock.invocationCallOrder[0]!);
  });

  test('reports no expiry for a toast that was unregistered', () => {
    const onExpire = vi.fn();
    register({ id: 'a', durationMs: DURATION_MS, onExpire });

    unregisterToast({ id: 'a' });
    vi.advanceTimersByTime(DURATION_MS * 10);

    expect(onExpire).not.toHaveBeenCalled();
  });

  test('a non-finite duration never dismisses', () => {
    register({ id: 'a', durationMs: Infinity });
    vi.advanceTimersByTime(DURATION_MS * 100);

    releaseToastTimers();
    vi.advanceTimersByTime(DURATION_MS * 100);
    expect(dismiss).not.toHaveBeenCalled();
  });
});
