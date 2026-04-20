import { onMounted, ref } from 'vue';

/**
 * Returns a ref that becomes `true` only after the component has mounted
 * and the browser has painted, preventing CSS transitions from firing
 * during the initial render (e.g. when values are restored from localStorage).
 */
export function useAfterMountTransition() {
  const isReady = ref(false);

  onMounted(() => {
    // "Double rAF" — a standard technique to defer work until after the browser
    // has painted. The browser event loop runs: JS → rAF callbacks → Style/Layout
    // → Paint. A single rAF fires before paint in the same frame, so style changes
    // made there can still be batched with the initial render. The second rAF is
    // guaranteed to run in the *next* frame, after the initial paint is
    // on-screen — making it safe to enable CSS transitions without them picking
    // up the initial state change.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        isReady.value = true;
      });
    });
  });

  return isReady;
}
