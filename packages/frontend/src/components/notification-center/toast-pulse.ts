const PULSE_ATTR = 'data-pulse';

export const PULSE_DURATION_MS = 300;

const pendingCleanups = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();

/**
 * Sonner renders the dedup id as `data-testid`. It carries colons and arbitrary user text, so it
 * is compared as a string — splicing it into a selector would break on the first odd character.
 */
export const findLiveToast = ({ id }: { id: string }): HTMLElement | null => {
  if (typeof document === 'undefined') return null;

  const toasts = Array.from(document.querySelectorAll<HTMLElement>('li[data-sonner-toast]'));

  return (
    toasts.find(
      (element) => element.getAttribute('data-testid') === id && element.getAttribute('data-removed') !== 'true',
    ) ?? null
  );
};

export const pulseToast = ({ element }: { element: HTMLElement }) => {
  const pending = pendingCleanups.get(element);
  if (pending !== undefined) clearTimeout(pending);

  // Re-adding the attribute only restarts a running animation once the removal is committed,
  // and the layout read forces that commit.
  element.removeAttribute(PULSE_ATTR);
  element.getBoundingClientRect?.();
  element.setAttribute(PULSE_ATTR, 'true');

  pendingCleanups.set(
    element,
    setTimeout(() => {
      pendingCleanups.delete(element);
      element.removeAttribute(PULSE_ATTR);
    }, PULSE_DURATION_MS),
  );
};
