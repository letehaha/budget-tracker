import { loadTransactions } from '@/api/transactions';
import { removeValuesFromObject } from '@/common/utils/remove-values-from-object';
import { TRANSACTION_TYPES, TransactionModel } from '@bt/shared/types';
import { useInfiniteQuery, useQueryClient } from '@tanstack/vue-query';
import isDate from 'date-fns/isDate';
import { Ref, ref } from 'vue';

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

export function useTransactions<T = TransactionFilters>({
  filters = ref<TransactionFilters>({ transactionType: null }),
  queryKey,
  limit = 30,
  queryOptions = {},
}: {
  filters?: Ref<TransactionFilters>;
  queryKey: Array<string | Ref<T>>;
  limit?: number;
  queryOptions?: Partial<Parameters<typeof useInfiniteQuery<TransactionModel[]>>[0]>;
}) {
  const queryClient = useQueryClient();

  const fetchTransactions = ({ pageParam }: { pageParam: number }) => {
    const from = pageParam * limit;

    return loadTransactions(
      removeValuesFromObject<Parameters<typeof loadTransactions>[0]>({
        limit,
        from,
        transactionType: filters.value.transactionType,
        endDate: isDate(filters.value.end) ? filters.value.end.toISOString() : undefined,
        startDate: isDate(filters.value.start) ? filters.value.start.toISOString() : undefined,
        amountGte: filters.value.amountGte,
        amountLte: filters.value.amountLte,
        excludeRefunds: filters.value.excludeRefunds,
        excludeTransfer: filters.value.excludeTransfer,
        budgetIds: filters.value.budgetIds,
        excludedBudgetIds: filters.value.excludedBudgetIds,
      }),
    );
  };

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
