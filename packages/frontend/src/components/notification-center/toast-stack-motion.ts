const SNAP_ATTR = 'data-removal-snap';
const MEASURE_CLAMPED_ATTR = 'data-measure-clamped';
const MEASURE_EXPANDED_ATTR = 'data-measure-expanded';
const TOAST_SELECTOR = ':scope > li[data-sonner-toast]';
const CONTENT_SELECTOR = '[data-content]';
const PX_EPSILON = 0.01;
// Sonner drops a dismissed toast's recorded height TIME_BEFORE_UNMOUNT + 50 after unmounting it.
export const HEIGHT_RELEASE_MS = 250;

interface StackHole {
  contributor: HTMLElement;
  px: number;
  retireAt: number | null;
}

const readOffsetPx = ({ toast }: { toast: HTMLElement }) => {
  const offset = Number.parseFloat(toast.style.getPropertyValue('--offset'));
  return Number.isFinite(offset) ? offset : 0;
};

const isRemoved = ({ toast }: { toast: HTMLElement }) => toast.dataset.removed === 'true';

const isExpandedInDom = ({ toast }: { toast: HTMLElement }) => toast.dataset.expanded === 'true';

const writeVar = ({ element, name, px }: { element: HTMLElement; name: string; px: number }) => {
  const value = px > PX_EPSILON ? `${px}px` : '';
  if (element.style.getPropertyValue(name) === value) return;

  if (value) element.style.setProperty(name, value);
  else element.style.removeProperty(name);
};

/**
 * Sonner records toast heights once at mount, so after a dismissal its `--offset` values keep
 * describing the old stack until the removed height is reclaimed ~450ms later. `--removed-lead`
 * cancels that stale part; `--push-up` lifts the toasts above a hovered, un-clamping one.
 */
export const createToastStackMotion = ({
  getList,
  getIsExpanded,
}: {
  getList: () => HTMLElement | null;
  getIsExpanded: () => boolean;
}) => {
  const holes = new WeakMap<HTMLElement, StackHole[]>();
  const lastOffsets = new WeakMap<HTMLElement, number>();
  const compensatedRemovals = new WeakSet<HTMLElement>();

  let hoveredToast: HTMLElement | null = null;
  let hoverPushPx: number | null = null;
  let retireTimer: ReturnType<typeof setTimeout> | null = null;
  let retireTimerAt = 0;

  const getToasts = ({ list }: { list: HTMLElement }) => Array.from(list.querySelectorAll<HTMLElement>(TOAST_SELECTOR));

  const leadPxOf = ({ toast }: { toast: HTMLElement }) =>
    (holes.get(toast) ?? []).reduce((total, hole) => total + hole.px, 0);

  // The forced read commits the compensated positions while transitions are still suppressed, so the
  // snap ends within this call and cannot flatten a transform change that comes after it.
  const releaseSnap = ({ list }: { list: HTMLElement }) => {
    list.getBoundingClientRect();
    list.removeAttribute(SNAP_ATTR);
  };

  // Both reads run in one synchronous block, so neither forced state reaches a paint. Measuring the
  // content box leaves the toast's own transitions intact; the clamped state is read last because
  // each read commits the style it forces and the reveal must transition away from the clamped one.
  const measureHoverExpansion = ({ toast }: { toast: HTMLElement }) => {
    const content = toast.querySelector<HTMLElement>(CONTENT_SELECTOR);
    if (!content) return 0;

    toast.setAttribute(MEASURE_EXPANDED_ATTR, '');
    const fullHeight = content.getBoundingClientRect().height;
    toast.removeAttribute(MEASURE_EXPANDED_ATTR);

    toast.setAttribute(MEASURE_CLAMPED_ATTR, '');
    const clampedHeight = content.getBoundingClientRect().height;
    toast.removeAttribute(MEASURE_CLAMPED_ATTR);

    return Math.max(0, fullHeight - clampedHeight);
  };

  const clearHoverPush = ({ list }: { list: HTMLElement }) => {
    hoverPushPx = null;
    getToasts({ list }).forEach((toast) => writeVar({ element: toast, name: '--push-up', px: 0 }));
  };

  const refreshHoverPush = ({ list }: { list: HTMLElement }) => {
    if (hoveredToast && (!hoveredToast.isConnected || isRemoved({ toast: hoveredToast }))) hoveredToast = null;

    const hovered = hoveredToast;
    if (!hovered || !getIsExpanded() || !isExpandedInDom({ toast: hovered })) {
      clearHoverPush({ list });
      return;
    }

    const pushPx = hoverPushPx ?? measureHoverExpansion({ toast: hovered });
    hoverPushPx = pushPx;

    const toasts = getToasts({ list });
    const hoveredIndex = toasts.indexOf(hovered);

    toasts.forEach((toast, index) => {
      writeVar({ element: toast, name: '--push-up', px: hoveredIndex >= 0 && index > hoveredIndex ? pushPx : 0 });
    });
  };

  const clearRetireTimer = () => {
    if (retireTimer === null) return;

    clearTimeout(retireTimer);
    retireTimer = null;
    retireTimerAt = 0;
  };

  const scheduleRetire = ({ at }: { at: number }) => {
    if (retireTimer !== null && retireTimerAt <= at) return;

    clearRetireTimer();
    retireTimerAt = at;
    retireTimer = setTimeout(
      () => {
        retireTimer = null;
        retireTimerAt = 0;
        syncStack();
      },
      Math.max(0, at - Date.now()),
    );
  };

  // A hole survives until sonner releases the height behind it: either the survivor's own offset
  // drops by that much, or the contributor has been unmounted long enough for the release to be due.
  const retireReleasedHoles = ({
    toast,
    reclaimedPx,
    now,
  }: {
    toast: HTMLElement;
    reclaimedPx: number;
    now: number;
  }) => {
    const toastHoles = holes.get(toast);
    if (!toastHoles?.length) return;

    let unmatchedPx = reclaimedPx;
    const kept: StackHole[] = [];

    toastHoles.forEach((hole) => {
      const isReleased = (hole.retireAt !== null && hole.retireAt <= now) || unmatchedPx >= hole.px - PX_EPSILON;
      if (!isReleased) {
        kept.push(hole);
        return;
      }

      unmatchedPx -= hole.px;
    });

    if (kept.length) holes.set(toast, kept);
    else holes.delete(toast);
  };

  const trackUnmountedContributors = ({ toast, now }: { toast: HTMLElement; now: number }) => {
    holes.get(toast)?.forEach((hole) => {
      if (hole.retireAt === null) {
        if (hole.contributor.isConnected) return;
        hole.retireAt = now + HEIGHT_RELEASE_MS;
      }

      scheduleRetire({ at: hole.retireAt });
    });
  };

  function syncStack() {
    const list = getList();
    if (!list) return;

    const toasts = getToasts({ list });

    if (!getIsExpanded()) {
      list.removeAttribute(SNAP_ATTR);
      hoveredToast = null;
      hoverPushPx = null;
      clearRetireTimer();

      toasts.forEach((toast) => {
        holes.delete(toast);
        // A dismissal that is still mounted has to stay re-derivable: nothing compensates it while
        // the stack is collapsed, so the next expansion must size its hole from the live offsets.
        compensatedRemovals.delete(toast);
        lastOffsets.set(toast, readOffsetPx({ toast }));
        writeVar({ element: toast, name: '--removed-lead', px: 0 });
        writeVar({ element: toast, name: '--push-up', px: 0 });
      });
      return;
    }

    refreshHoverPush({ list });

    const now = Date.now();
    const offsets = new Map<HTMLElement, number>();
    const previousOffsets = new Map<HTMLElement, number>();
    const previousLeads = new Map<HTMLElement, number>();
    const addedLeads = new Map<HTMLElement, number>();
    const openedHoles: { survivor: HTMLElement; hole: StackHole }[] = [];

    toasts.forEach((toast) => {
      const offset = readOffsetPx({ toast });
      offsets.set(toast, offset);
      previousOffsets.set(toast, lastOffsets.get(toast) ?? offset);
      previousLeads.set(toast, leadPxOf({ toast }));
      addedLeads.set(toast, 0);
    });

    const renderedOffsetOf = ({ toast }: { toast: HTMLElement }) =>
      (previousOffsets.get(toast) ?? 0) - (previousLeads.get(toast) ?? 0) - (addedLeads.get(toast) ?? 0);

    let snapped = false;

    // Oldest first: a survivor's rendered offset must already account for every later-in-DOM
    // removal before it is used to size the hole an earlier-in-DOM one leaves behind.
    for (let index = toasts.length - 1; index >= 0; index -= 1) {
      const toast = toasts[index];
      if (!toast || !isRemoved({ toast }) || compensatedRemovals.has(toast)) continue;

      compensatedRemovals.add(toast);

      const survivors = toasts.slice(index + 1).filter((candidate) => !isRemoved({ toast: candidate }));
      const [nextSurvivor] = survivors;
      if (!nextSurvivor) continue;

      const holePx = renderedOffsetOf({ toast: nextSurvivor }) - renderedOffsetOf({ toast });
      if (holePx <= PX_EPSILON) continue;

      survivors.forEach((survivor) => {
        addedLeads.set(survivor, (addedLeads.get(survivor) ?? 0) + holePx);
        openedHoles.push({ survivor, hole: { contributor: toast, px: holePx, retireAt: null } });
      });
      snapped = true;
    }

    // A dismissed toast freezes its own `--offset`, so a released height never surfaces as a drop there.
    toasts.forEach((toast) => {
      if (isRemoved({ toast })) return;

      const reclaimedPx = (previousOffsets.get(toast) ?? 0) - (offsets.get(toast) ?? 0);
      retireReleasedHoles({ toast, reclaimedPx, now });
    });

    openedHoles.forEach(({ survivor, hole }) => holes.set(survivor, [...(holes.get(survivor) ?? []), hole]));

    // Must land before the lead writes below so both reach the same style recalculation.
    if (snapped) list.setAttribute(SNAP_ATTR, '');

    toasts.forEach((toast) => {
      lastOffsets.set(toast, offsets.get(toast) ?? 0);
      writeVar({ element: toast, name: '--removed-lead', px: leadPxOf({ toast }) });
      if (!isRemoved({ toast })) trackUnmountedContributors({ toast, now });
    });

    if (snapped) releaseSnap({ list });
  }

  // Focus expands a toast exactly like hover does, so both feed the same measurement.
  const handlePointerOver = ({ event }: { event: PointerEvent | FocusEvent }) => {
    if ('pointerType' in event && event.pointerType === 'touch') return;

    const target = event.target;
    const toast = target instanceof Element ? target.closest<HTMLElement>('li[data-sonner-toast]') : null;
    if (toast === hoveredToast) return;

    const list = getList();
    if (!list) return;
    if (toast && !list.contains(toast)) return;

    hoveredToast = toast;
    hoverPushPx = null;
    refreshHoverPush({ list });
  };

  const reset = () => {
    hoveredToast = null;
    hoverPushPx = null;
    clearRetireTimer();

    const list = getList();
    if (!list) return;

    list.removeAttribute(SNAP_ATTR);
    getToasts({ list }).forEach((toast) => {
      holes.delete(toast);
      compensatedRemovals.delete(toast);
      lastOffsets.delete(toast);
      writeVar({ element: toast, name: '--removed-lead', px: 0 });
      writeVar({ element: toast, name: '--push-up', px: 0 });
    });
  };

  return { syncStack, handlePointerOver, reset };
};
