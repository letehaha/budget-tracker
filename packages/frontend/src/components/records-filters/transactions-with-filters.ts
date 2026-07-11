import { loadTransactions } from '@/api/transactions';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import { DEFAULT_FILTERS, FiltersStruct, SELECTABLE_TRANSFER_NATURES } from '@/components/records-filters/const';
import {
  FILTER_OPERATION,
  SORT_DIRECTIONS,
  TRANSACTION_SORT_FIELD,
  TRANSACTION_TRANSFER_NATURE,
} from '@bt/shared/types';
import { keepPreviousData, useInfiniteQuery, useQueryClient } from '@tanstack/vue-query';
import isDate from 'date-fns/isDate';
import { isEqual, isNil, omitBy } from 'lodash-es';
import { MaybeRef, Ref, computed, ref } from 'vue';

const filterOrUndefined = (value: FILTER_OPERATION) => (value === FILTER_OPERATION.all ? undefined : value);

interface TransactionsSorting {
  sortBy: TRANSACTION_SORT_FIELD;
  order: SORT_DIRECTIONS;
}

/**
 * Computes the `transferNatures` query param. Returns undefined when the user's
 * selection doesn't narrow anything (all kinds selected, or transfers excluded
 * entirely — the coarse transferFilter already handles that). Otherwise returns
 * the exact include-list: selected transfer kinds plus `not_transfer`, unless
 * the transfers toggle is "only" (then plain transactions are excluded too).
 */
export const buildTransferNaturesParam = (filter: FiltersStruct): TRANSACTION_TRANSFER_NATURE[] | undefined => {
  const selected = filter.transferNatures;
  const allSelected = SELECTABLE_TRANSFER_NATURES.every((nature) => selected.includes(nature));
  if (allSelected || filter.transferFilter === FILTER_OPERATION.exclude) return undefined;

  return filter.transferFilter === FILTER_OPERATION.only
    ? selected
    : [TRANSACTION_TRANSFER_NATURE.not_transfer, ...selected];
};

export const useTransactionsWithFilters = ({
  limit = 30,
  appendQueryKey = [],
  queryEnabled = true,
  staticFilters = {},
  sorting,
}: {
  limit?: number;
  appendQueryKey?: unknown[];
  queryEnabled?: MaybeRef<boolean>;
  staticFilters?: Partial<FiltersStruct>;
  /** Backend-side sorting. When omitted, defaults to time DESC. */
  sorting?: Ref<TransactionsSorting>;
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
    const offset = pageParam * limit;

    return loadTransactions(
      omitBy(
        {
          limit,
          offset,
          transactionType: filter.transactionType ?? undefined,
          to: isDate(filter.end) ? filter.end!.toISOString() : undefined,
          from: isDate(filter.start) ? filter.start!.toISOString() : undefined,
          amountGte: filter.amountGte,
          amountLte: filter.amountLte,
          noteSearch: filter.noteIncludes,
          transferFilter: filterOrUndefined(filter.transferFilter),
          refundFilter: filterOrUndefined(filter.refundFilter),
          transferNatures: buildTransferNaturesParam(filter),
          sortBy: sorting?.value.sortBy,
          order: sorting?.value.order,
          accountIds: filter.accountIds.length ? filter.accountIds : undefined,
          categoryIds: filter.categoryIds.length ? filter.categoryIds : undefined,
          tagIds: filter.tagIds.length ? filter.tagIds : undefined,
          payeeIds: filter.payeeIds.length ? filter.payeeIds : undefined,
          categorizationSource: filter.categorizationSource ?? undefined,
          budgetIds: staticFilters.budgetIds ?? undefined,
          excludedBudgetIds: staticFilters.excludedBudgetIds ?? undefined,
          includeSplits: true,
          includeTags: true,
          includeGroups: true,
        },
        isNil,
      ) as Parameters<typeof loadTransactions>[0],
    );
  };

  const queryKey = [
    ...VUE_QUERY_CACHE_KEYS.recordsPageRecordsList,
    appliedFilters,
    ...(sorting ? [sorting] : []),
    ...appendQueryKey,
  ];

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
    // Filters apply as the user edits them — keep the previous result on screen
    // while the re-filtered list loads instead of flashing an empty table.
    placeholderData: keepPreviousData,
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
