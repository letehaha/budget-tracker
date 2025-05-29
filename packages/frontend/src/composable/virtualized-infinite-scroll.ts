import { useVirtualizer } from '@tanstack/vue-virtual';
import { Ref, computed, ref, watchEffect } from 'vue';

interface UseVirtualizedInfiniteScrollOptions<T> {
  // Data source and pagination
  items: Ref<T[]>;
  hasNextPage: Ref<boolean>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fetchNextPage: () => Promise<any>;
  isFetchingNextPage: Ref<boolean>;

  // Virtualizer options
  parentRef: Ref<HTMLElement | null>;
  estimateSize?: () => number;
  overscan?: number;
  enabled?: Ref<boolean>;

  getItemKey?: (index: number) => string | number;
}

export function useVirtualizedInfiniteScroll<T>({
  items,
  hasNextPage,
  fetchNextPage,
  isFetchingNextPage,
  parentRef,
  estimateSize = () => 52,
  overscan = 10,
  enabled = ref(true),
  getItemKey = (index: number) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (items?.value?.[index] as any)?.id ?? index;
  },
}: UseVirtualizedInfiniteScrollOptions<T>) {
  const virtualizer = useVirtualizer(
    computed(() => ({
      count: items.value.length + (hasNextPage.value ? 1 : 0),
      getScrollElement: () => parentRef.value,
      estimateSize,
      overscan,
      enabled: enabled.value,
      getItemKey: (index) => {
        try {
          return getItemKey(index);
        } catch {
          return index;
        }
      },
    })),
  );

  const virtualRows = computed(() => virtualizer.value.getVirtualItems());

  // Auto-fetch next page when scrolling to the bottom
  watchEffect(() => {
    const [lastItem] = [...virtualRows.value].reverse();

    if (!lastItem) return;

    if (lastItem.index >= items.value.length - 1 && hasNextPage.value && !isFetchingNextPage.value) {
      fetchNextPage();
    }
  });

  return {
    virtualizer,
    virtualRows,
    totalSize: computed(() => virtualizer.value.getTotalSize()),
  };
}
