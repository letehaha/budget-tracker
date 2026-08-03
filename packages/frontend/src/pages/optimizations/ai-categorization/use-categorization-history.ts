import { getAiCategorizationHistory } from '@/api/ai-categorization';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const/vue-query';
import { useInfiniteQuery } from '@tanstack/vue-query';
import { computed } from 'vue';

const HISTORY_PAGE_LIMIT = 20;

/** Past AI categorization runs, newest first. */
export function useCategorizationHistory() {
  const {
    data: historyPages,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isFetched,
    isLoadingError,
    refetch,
  } = useInfiniteQuery({
    queryKey: [...VUE_QUERY_CACHE_KEYS.aiCategorizationHistory],
    queryFn: ({ pageParam }) =>
      getAiCategorizationHistory({ limit: HISTORY_PAGE_LIMIT, offset: pageParam * HISTORY_PAGE_LIMIT }),
    initialPageParam: 0,
    // Only the first page carries `totalCount`, so the page size is what decides
    // whether another page exists.
    getNextPageParam: (lastPage, pages) => {
      if (lastPage.items.length < HISTORY_PAGE_LIMIT) return undefined;
      return pages.length;
    },
  });

  const runs = computed(() => historyPages.value?.pages.flatMap((page) => page.items) ?? []);

  return {
    runs,
    isFetched,
    isLoadingError,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    refetch,
  };
}
