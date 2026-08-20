import { useInfiniteQuery } from '@tanstack/vue-query';
import { computed } from 'vue';

const DEFAULT_PAGE_LIMIT = 20;

/**
 * Shared shape for a "history" list backed by limit/offset pagination where
 * only the first page (`offset === 0`) carries a `totalCount` and later pages
 * get `null` — used by AI categorization history and import batch history.
 * Flattens pages into a single reactive list and drives infinite scroll.
 */
export function useOffsetHistoryQuery<TItem>({
  queryKey,
  fetchPage,
  pageLimit = DEFAULT_PAGE_LIMIT,
}: {
  queryKey: readonly unknown[];
  fetchPage: (params: { limit: number; offset: number }) => Promise<{ items: TItem[] }>;
  pageLimit?: number;
}) {
  const {
    data: historyPages,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isFetched,
    isLoadingError,
    refetch,
  } = useInfiniteQuery({
    queryKey: [...queryKey],
    queryFn: ({ pageParam }) => fetchPage({ limit: pageLimit, offset: pageParam * pageLimit }),
    initialPageParam: 0,
    // Only the first page carries `totalCount`, so the page size is what decides
    // whether another page exists.
    getNextPageParam: (lastPage, pages) => {
      if (lastPage.items.length < pageLimit) return undefined;
      return pages.length;
    },
  });

  const items = computed(() => historyPages.value?.pages.flatMap((page) => page.items) ?? []);

  return {
    items,
    isFetched,
    isLoadingError,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    refetch,
  };
}
