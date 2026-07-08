import { type Ref, onScopeDispose, ref } from 'vue';

const DEFAULT_IDLE_TIMEOUT_MS = 2000;

/**
 * Returns a boolean ref that starts `false` and flips to `true` once the browser
 * reaches an idle moment (via `requestIdleCallback`, with a `setTimeout` fallback
 * for engines like Safari that lack it). Use it to gate non-critical work — extra
 * network requests, background checks — off the initial render's critical path so
 * above-the-fold data loads first.
 *
 * `timeout` bounds the wait: `requestIdleCallback` fires by this deadline even under
 * constant load, so the deferred work is never starved on a busy page.
 */
export function useIdleEnabled({ timeout = DEFAULT_IDLE_TIMEOUT_MS }: { timeout?: number } = {}): Ref<boolean> {
  const enabled = ref(false);

  let idleHandle: number | null = null;
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

  const flip = () => {
    enabled.value = true;
  };

  if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
    idleHandle = window.requestIdleCallback(flip, { timeout });
  } else {
    timeoutHandle = setTimeout(flip, timeout);
  }

  onScopeDispose(() => {
    if (idleHandle !== null && typeof window !== 'undefined' && typeof window.cancelIdleCallback === 'function') {
      window.cancelIdleCallback(idleHandle);
    }
    if (timeoutHandle !== null) {
      clearTimeout(timeoutHandle);
    }
  });

  return enabled;
}
