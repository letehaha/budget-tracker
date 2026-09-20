import type { Virtualizer } from '@tanstack/vue-virtual';
import { useSessionStorage } from '@vueuse/core';
import { type MaybeRefOrGetter, type Ref, onBeforeUnmount, toValue, watch } from 'vue';

/**
 * Restores a virtualized list's scroll position after its component is unmounted
 * and mounted again (e.g. a round trip to a detail route). The first visible row
 * index is stored rather than a pixel offset, because row heights are only
 * estimates until each row is measured.
 *
 * `useScrollMemory` covers the other case: a scroller hidden inside a component
 * that itself stays mounted.
 */
export function useVirtualizerScrollMemory({
  storageKey,
  virtualizer,
  scrollElement,
  itemsCount,
}: {
  /** Unique per list – two lists sharing a key restore each other's position. */
  storageKey: string;
  virtualizer: Ref<Pick<Virtualizer<HTMLElement, Element>, 'range' | 'scrollToIndex'>>;
  /** The scrollable element; `null`/`undefined` while unmounted. */
  scrollElement: MaybeRefOrGetter<HTMLElement | null | undefined>;
  /** Loaded rows. A saved index past it is ignored instead of chain-fetching pages to reach it. */
  itemsCount: MaybeRefOrGetter<number>;
}) {
  // `flush: 'sync'` is required: the default pre-flush write queued from
  // `onBeforeUnmount` is dropped when the component's effect scope stops.
  const savedRowIndex = useSessionStorage(storageKey, 0, { flush: 'sync' });

  watch(
    () => toValue(scrollElement),
    (el) => {
      if (!el) return;
      if (savedRowIndex.value > 0 && savedRowIndex.value < toValue(itemsCount)) {
        virtualizer.value.scrollToIndex(savedRowIndex.value, { align: 'start' });
      }
      savedRowIndex.value = 0;
    },
    { flush: 'post' },
  );

  onBeforeUnmount(() => {
    savedRowIndex.value = virtualizer.value.range?.startIndex ?? 0;
  });
}
