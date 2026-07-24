import { STALL_TAKING_LONG_THRESHOLD_MS, useStallTimer } from '@/composable/use-stall-timer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('useStallTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('flips to taking long once a signature holds unchanged for the threshold', () => {
    const timer = useStallTimer();
    timer.track({ signature: 'phase-a' });

    vi.advanceTimersByTime(STALL_TAKING_LONG_THRESHOLD_MS - 1);
    expect(timer.isTakingLong.value).toBe(false);

    vi.advanceTimersByTime(1);
    expect(timer.isTakingLong.value).toBe(true);
  });

  it('re-arms the clock only when the signature actually changes', () => {
    const timer = useStallTimer();
    timer.track({ signature: 'phase-a' });

    // Same signature fed repeatedly must not reset the clock.
    vi.advanceTimersByTime(STALL_TAKING_LONG_THRESHOLD_MS - 1000);
    timer.track({ signature: 'phase-a' });
    vi.advanceTimersByTime(1000);
    expect(timer.isTakingLong.value).toBe(true);

    // A real change clears the note and restarts the window.
    timer.track({ signature: 'phase-b' });
    expect(timer.isTakingLong.value).toBe(false);
    vi.advanceTimersByTime(STALL_TAKING_LONG_THRESHOLD_MS);
    expect(timer.isTakingLong.value).toBe(true);
  });

  it('honors a custom threshold', () => {
    const timer = useStallTimer({ thresholdMs: 1000 });
    timer.track({ signature: 'x' });

    vi.advanceTimersByTime(999);
    expect(timer.isTakingLong.value).toBe(false);
    vi.advanceTimersByTime(1);
    expect(timer.isTakingLong.value).toBe(true);
  });

  it('arm starts a fresh clock without a signature', () => {
    const timer = useStallTimer();
    timer.arm();

    vi.advanceTimersByTime(STALL_TAKING_LONG_THRESHOLD_MS);
    expect(timer.isTakingLong.value).toBe(true);
  });

  it('reset disarms the timer and forgets the signature', () => {
    const timer = useStallTimer();
    timer.track({ signature: 'phase-a' });
    timer.reset();

    vi.advanceTimersByTime(STALL_TAKING_LONG_THRESHOLD_MS);
    expect(timer.isTakingLong.value).toBe(false);

    // After a reset the same signature counts as new and re-arms.
    timer.track({ signature: 'phase-a' });
    vi.advanceTimersByTime(STALL_TAKING_LONG_THRESHOLD_MS);
    expect(timer.isTakingLong.value).toBe(true);
  });
});
