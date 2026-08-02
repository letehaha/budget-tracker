import { useUserActivity } from '@/composable/use-user-activity';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type EffectScope, type MaybeRefOrGetter, effectScope, nextTick, ref } from 'vue';

const IDLE_AFTER_MS = 2000;

let scope: EffectScope;

const setup = ({ idleAfterMs = IDLE_AFTER_MS }: { idleAfterMs?: MaybeRefOrGetter<number> } = {}) => {
  scope = effectScope();
  return scope.run(() => useUserActivity({ idleAfterMs }))!;
};

const setTabHidden = ({ hidden }: { hidden: boolean }) => {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  document.dispatchEvent(new Event('visibilitychange'));
};

const interact = ({ type = 'pointerdown' }: { type?: string } = {}) => {
  document.dispatchEvent(new Event(type));
};

describe('useUserActivity', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
  });

  afterEach(() => {
    scope?.stop();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('starts active on a visible tab and goes idle after the window passes', () => {
    const activity = setup();
    expect(activity.isActive.value).toBe(true);

    vi.advanceTimersByTime(IDLE_AFTER_MS - 1);
    expect(activity.isActive.value).toBe(true);

    vi.advanceTimersByTime(1);
    expect(activity.isActive.value).toBe(false);
  });

  it.each(['pointerdown', 'keydown', 'wheel', 'scroll', 'touchstart'])('treats %s as a real interaction', (type) => {
    const activity = setup();
    vi.advanceTimersByTime(IDLE_AFTER_MS);
    expect(activity.isActive.value).toBe(false);

    interact({ type });
    expect(activity.isActive.value).toBe(true);
  });

  it('restarts the idle window on every interaction', () => {
    const activity = setup();

    vi.advanceTimersByTime(IDLE_AFTER_MS - 100);
    interact();
    vi.advanceTimersByTime(IDLE_AFTER_MS - 1);
    expect(activity.isActive.value).toBe(true);

    vi.advanceTimersByTime(1);
    expect(activity.isActive.value).toBe(false);
  });

  it('records when the last interaction happened', () => {
    const activity = setup();
    const startedAt = activity.lastActiveAt.value;

    vi.advanceTimersByTime(500);
    interact();
    expect(activity.lastActiveAt.value).toBe(startedAt + 500);
  });

  it('goes idle the moment the tab is hidden', () => {
    const activity = setup();

    vi.advanceTimersByTime(100);
    setTabHidden({ hidden: true });
    expect(activity.isActive.value).toBe(false);
  });

  it('resumes only the leftover window when the tab becomes visible again', () => {
    const activity = setup();

    vi.advanceTimersByTime(500);
    setTabHidden({ hidden: true });
    vi.advanceTimersByTime(100);
    setTabHidden({ hidden: false });
    expect(activity.isActive.value).toBe(true);

    // Time hidden still counts, so only the remainder of the original window is left.
    vi.advanceTimersByTime(IDLE_AFTER_MS - 600 - 1);
    expect(activity.isActive.value).toBe(true);
    vi.advanceTimersByTime(1);
    expect(activity.isActive.value).toBe(false);
  });

  it('stays idle when the tab returns after the window already passed', () => {
    const activity = setup();

    setTabHidden({ hidden: true });
    vi.advanceTimersByTime(IDLE_AFTER_MS + 1);
    setTabHidden({ hidden: false });
    expect(activity.isActive.value).toBe(false);
  });

  it('re-evaluates the window when a reactive idleAfterMs changes', async () => {
    const idleAfterMs = ref(IDLE_AFTER_MS);
    const activity = setup({ idleAfterMs });

    vi.advanceTimersByTime(IDLE_AFTER_MS - 1);
    idleAfterMs.value = IDLE_AFTER_MS * 2;
    await nextTick();

    vi.advanceTimersByTime(IDLE_AFTER_MS);
    expect(activity.isActive.value).toBe(true);

    vi.advanceTimersByTime(IDLE_AFTER_MS);
    expect(activity.isActive.value).toBe(false);
  });

  it('stops listening and clears its timer once the scope is disposed', () => {
    const activity = setup();

    vi.advanceTimersByTime(IDLE_AFTER_MS);
    expect(activity.isActive.value).toBe(false);

    scope.stop();
    interact();
    expect(activity.isActive.value).toBe(false);
  });
});
