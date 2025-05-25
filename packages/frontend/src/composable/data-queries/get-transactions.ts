import { loadTransactions } from '@/api/transactions';
import { removeValuesFromObject } from '@/common/utils/remove-values-from-object';
import { TRANSACTION_TYPES, TransactionModel } from '@bt/shared/types';
import { useInfiniteQuery, useQueryClient } from '@tanstack/vue-query';
import isDate from 'date-fns/isDate';
import { MaybeRef, ref, unref } from 'vue';

interface TransactionFilters {
  transactionType?: TRANSACTION_TYPES | null;
  start?: Date | undefined;
  end?: Date | undefined;
  amountGte?: number | undefined;
  amountLte?: number | undefined;
  excludeRefunds?: boolean | undefined;
  excludeTransfer?: boolean | undefined;
  budgetIds?: number[] | undefined;
  excludedBudgetIds?: number[] | undefined;
  [key: string]: unknown;
}

type TransactionsQueryOptions = Partial<Parameters<typeof useInfiniteQuery<TransactionModel[]>>[0]>;

export function useTransactions({
  filters = { transactionType: null },
  limit = 30,
  queryOptions = {},
}: {
  filters?: MaybeRef<TransactionFilters>;
  limit?: number;
  queryOptions?: TransactionsQueryOptions & { queryKey?: unknown[] };
}) {
  const queryClient = useQueryClient();
  const filtersRef = ref(filters);

  const fetchTransactions = ({ pageParam }: { pageParam: number }) => {
    const from = pageParam * limit;
    const currentFilters = unref(filtersRef.value);

    return loadTransactions(
      removeValuesFromObject<Parameters<typeof loadTransactions>[0]>({
        limit,
        from,
        transactionType: currentFilters.transactionType,
        endDate: isDate(currentFilters.end) ? currentFilters.end.toISOString() : undefined,
        startDate: isDate(currentFilters.start) ? currentFilters.start.toISOString() : undefined,
        amountGte: currentFilters.amountGte,
        amountLte: currentFilters.amountLte,
        excludeRefunds: currentFilters.excludeRefunds,
        excludeTransfer: currentFilters.excludeTransfer,
        budgetIds: currentFilters.budgetIds,
        excludedBudgetIds: currentFilters.excludedBudgetIds,
      }),
    );
  };

  const { queryKey = ['transactions', filtersRef] } = queryOptions;

  const query = useInfiniteQuery<TransactionModel[]>({
    queryKey,
    queryFn: ({ pageParam }) => fetchTransactions({ pageParam } as { pageParam: number }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) => {
      if (lastPage.length < limit) return undefined;
      return pages.length;
    },
    staleTime: 1_000 * 60,
    ...queryOptions,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey });
  };

  return {
    transactionsPages: query.data,
    fetchNextPage: query.fetchNextPage,
    hasNextPage: query.hasNextPage,
    isFetched: query.isFetched,
    invalidate,
    refetch: query.refetch,
    ...query,
  };
}
