/**
 * Resolves when a CSS animation with the given `animationName` ends on `element` (or any descendant,
 * since `animationend` bubbles). Also resolves on `animationcancel` and on the `fallbackMs` safety
 * timeout — so callers are never left hanging if the animation never fires.
 *
 * Returns immediately if no element is provided.
 *
 * Example:
 *   await waitForAnimationEnd(wrapperRef.value, 'collapsible-down');
 */
export const waitForAnimationEnd = (
  element: HTMLElement | undefined | null,
  animationName: string,
  fallbackMs = 500,
): Promise<void> =>
  new Promise((resolve) => {
    if (!element) return resolve();

    const cleanup = () => {
      element.removeEventListener('animationend', handler);
      element.removeEventListener('animationcancel', handler);
      clearTimeout(timeoutId);
    };

    const handler = (e: AnimationEvent) => {
      if (e.animationName === animationName) {
        cleanup();
        resolve();
      }
    };

    const timeoutId = setTimeout(() => {
      cleanup();
      resolve();
    }, fallbackMs);

    element.addEventListener('animationend', handler);
    element.addEventListener('animationcancel', handler);
  });
