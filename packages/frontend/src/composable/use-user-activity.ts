import { useEventListener } from '@vueuse/core';
import { type MaybeRefOrGetter, type Ref, onScopeDispose, ref, toValue, watch } from 'vue';

/**
 * Events that count as the user genuinely working with the page. Pointer moves
 * and focus changes are deliberately absent — a mouse drifting over a forgotten
 * tab must not read as activity.
 */
const ACTIVITY_EVENTS: (keyof DocumentEventMap)[] = ['pointerdown', 'keydown', 'wheel', 'scroll', 'touchstart'];

interface UseUserActivityReturn {
  /** True while the user interacted within `idleAfterMs` and the tab is visible. */
  isActive: Readonly<Ref<boolean>>;
}

/**
 * Tracks whether the user is currently working with the page. A hidden tab is
 * idle at once rather than after the timeout, so a forgotten background tab
 * stops driving anything that keys off activity — server-side leases especially.
 */
export function useUserActivity({ idleAfterMs }: { idleAfterMs: MaybeRefOrGetter<number> }): UseUserActivityReturn {
  /** Timestamp (ms) of the last real interaction; the idle window is measured from it. */
  const lastActiveAt = ref(Date.now());
  const isActive = ref(false);

  let idleTimer: ReturnType<typeof setTimeout> | null = null;

  const stopIdleTimer = () => {
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
  };

  const goIdle = () => {
    stopIdleTimer();
    isActive.value = false;
  };

  /** Re-derives activity from how long ago the last interaction was. */
  const resumeIdleWindow = () => {
    if (document.hidden) {
      goIdle();
      return;
    }

    const remainingMs = toValue(idleAfterMs) - (Date.now() - lastActiveAt.value);
    if (remainingMs <= 0) {
      goIdle();
      return;
    }

    stopIdleTimer();
    isActive.value = true;
    idleTimer = setTimeout(goIdle, remainingMs);
  };

  const markActive = () => {
    lastActiveAt.value = Date.now();
    resumeIdleWindow();
  };

  useEventListener(document, ACTIVITY_EVENTS, markActive, { passive: true, capture: true });
  useEventListener(document, 'visibilitychange', resumeIdleWindow, { passive: true });

  watch(() => toValue(idleAfterMs), resumeIdleWindow);

  resumeIdleWindow();

  onScopeDispose(stopIdleTimer);

  return { isActive };
}
