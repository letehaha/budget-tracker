import { loadTransactions } from '@/api/transactions';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import { removeValuesFromObject } from '@/common/utils/remove-values-from-object';
import { DEFAULT_FILTERS, FiltersStruct } from '@/components/records-filters/const';
import { FILTER_OPERATION } from '@bt/shared/types';
import { useInfiniteQuery, useQueryClient } from '@tanstack/vue-query';
import isDate from 'date-fns/isDate';
import { isEqual } from 'lodash-es';
import { MaybeRef, computed, ref } from 'vue';

const filterOrUndefined = (value: FILTER_OPERATION) => (value === FILTER_OPERATION.all ? undefined : value);

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
  const defaultWithStatic = { ...DEFAULT_FILTERS, ...staticFilters };
  const filters = ref<FiltersStruct>({ ...defaultWithStatic });
  const appliedFilters = ref<FiltersStruct>({ ...defaultWithStatic });

  const transactionsListRef = ref<{ scrollToIndex: (index: number) => void } | null>(null);

  const isResetButtonDisabled = computed(() => isEqual(filters.value, defaultWithStatic));
  const isAnyFiltersApplied = computed(() => !isEqual(appliedFilters.value, defaultWithStatic));
  const isFiltersOutOfSync = computed(() => !isEqual(filters.value, appliedFilters.value));

  const resetFilters = () => {
    filters.value = { ...defaultWithStatic };
    appliedFilters.value = { ...defaultWithStatic };
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
        transactionType: filter.transactionType ?? undefined,
        endDate: isDate(filter.end) ? filter.end!.toISOString() : undefined,
        startDate: isDate(filter.start) ? filter.start!.toISOString() : undefined,
        amountGte: filter.amountGte,
        amountLte: filter.amountLte,
        noteSearch: filter.noteIncludes,
        transferFilter: filterOrUndefined(filter.transferFilter),
        refundFilter: filterOrUndefined(filter.refundFilter),
        accountIds: filter.accounts.length ? filter.accounts.map((i) => i.id) : undefined,
        categoryIds: filter.categoryIds.length ? filter.categoryIds : undefined,
        tagIds: filter.tagIds.length ? filter.tagIds : undefined,
        categorizationSource: filter.categorizationSource ?? undefined,
        budgetIds: staticFilters.budgetIds ?? undefined,
        excludedBudgetIds: staticFilters.excludedBudgetIds ?? undefined,
        includeSplits: true,
        includeTags: true,
        includeGroups: true,
      } as Parameters<typeof loadTransactions>[0]),
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
