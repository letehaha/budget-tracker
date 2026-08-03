import { type MaybeRefOrGetter, nextTick, ref, toValue, watch } from 'vue';

/**
 * Remembers a scroll container's position across a temporary swap-away (drill-down
 * view, unmounted pane). The offset is captured the moment `isAway` turns truthy —
 * the pre-flush watcher still sees the element mounted — and re-applied one tick
 * after it turns falsy, once the returning view is back in the DOM.
 *
 * KeepAlive is the abolished alternative here: browsers zero `scrollTop` on any
 * element that leaves the document, so a kept-alive view still comes back at 0.
 */
export function useScrollMemory({
  element,
  isAway,
}: {
  /** The scrollable element; `null`/`undefined` while unmounted. */
  element: MaybeRefOrGetter<HTMLElement | null | undefined>;
  /** Truthy while the scroller is hidden or unmounted. */
  isAway: MaybeRefOrGetter<unknown>;
}) {
  const savedScrollTop = ref(0);

  watch(
    () => Boolean(toValue(isAway)),
    async (away, wasAway) => {
      if (away && !wasAway) {
        savedScrollTop.value = toValue(element)?.scrollTop ?? 0;
        return;
      }
      if (!away && wasAway) {
        await nextTick();
        const el = toValue(element);
        if (el) el.scrollTop = savedScrollTop.value;
      }
    },
  );

  return { savedScrollTop };
}
