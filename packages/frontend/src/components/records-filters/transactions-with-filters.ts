import { loadTransactions } from '@/api/transactions';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import { removeValuesFromObject } from '@/common/utils/remove-values-from-object';
import { DEFAULT_FILTERS, FiltersStruct } from '@/components/records-filters/const';
import { useInfiniteQuery } from '@tanstack/vue-query';
import { useQueryClient } from '@tanstack/vue-query';
import isDate from 'date-fns/isDate';
import { isEqual } from 'lodash-es';
import { MaybeRef, computed, ref } from 'vue';

export const useTransactionsWithFilters = ({
  limit = 30,
  appendQueryKey = [],
  queryEnabled = true,
  staticFilters = {},
}: {
  limit?: number;
  appendQueryKey?: unknown[];
  queryEnabled?: MaybeRef<boolean>;
  staticFilters?: Partial<FiltersStruct>;
} = {}) => {
  const queryClient = useQueryClient();
  const filters = ref<FiltersStruct>({ ...DEFAULT_FILTERS });
  const appliedFilters = ref<FiltersStruct>({ ...DEFAULT_FILTERS });

  const transactionsListRef = ref(null);

  const isResetButtonDisabled = computed(() => isEqual(filters.value, DEFAULT_FILTERS));
  const isAnyFiltersApplied = computed(() => !isEqual(appliedFilters.value, DEFAULT_FILTERS));
  const isFiltersOutOfSync = computed(() => !isEqual(filters.value, appliedFilters.value));

  const resetFilters = () => {
    filters.value = { ...DEFAULT_FILTERS };
    appliedFilters.value = { ...DEFAULT_FILTERS };
  };

  const applyFilters = () => {
    appliedFilters.value = { ...filters.value };

    if (transactionsListRef.value) {
      transactionsListRef.value.scrollToIndex(0);
    }
  };

  const fetchTransactions = ({ pageParam, filter }: { pageParam: number; filter: FiltersStruct }) => {
    const from = pageParam * limit;

    return loadTransactions(
      removeValuesFromObject({
        limit,
        from,
        transactionType: filter.transactionType,
        endDate: isDate(filter.end) ? filter.end.toISOString() : undefined,
        startDate: isDate(filter.start) ? filter.start.toISOString() : undefined,
        amountGte: filter.amountGte,
        amountLte: filter.amountLte,
        noteSearch: filter.noteIncludes,
        excludeRefunds: filter.excludeRefunds,
        excludeTransfer: filter.excludeTransfer,
        accountIds: filter.accounts.length ? filter.accounts.map((i) => i.id) : undefined,
        categoryIds: filter.categoryIds.length ? filter.categoryIds : undefined,
        categorizationSource: filter.categorizationSource,
        budgetIds: staticFilters.budgetIds,
        excludedBudgetIds: staticFilters.excludedBudgetIds,
        includeSplits: true,
        ...staticFilters,
      }),
    );
  };

  const queryKey = [...VUE_QUERY_CACHE_KEYS.recordsPageRecordsList, appliedFilters, ...appendQueryKey];

  const {
    data: transactionsPages,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isFetched,
    isFetching,
  } = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => fetchTransactions({ pageParam, filter: appliedFilters.value }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) => {
      if (lastPage.length < limit) return undefined;
      return pages.length;
    },
    staleTime: 1_000 * 60,
    enabled: queryEnabled,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  return {
    isResetButtonDisabled,
    isAnyFiltersApplied,
    isFiltersOutOfSync,
    filters,
    appliedFilters,
    resetFilters,
    applyFilters,
    transactionsPages,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isFetched,
    isFetching,
    transactionsListRef,
    invalidate,
  };
};
