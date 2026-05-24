import {
  HoldingTransactionsResponse,
  createInvestmentTransaction,
  deleteInvestmentTransaction,
  getHoldingTransactions,
  getPortfolioInvestmentTransactions,
} from '@/api/investment-transactions';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { MaybeRef, Ref, computed, toRef } from 'vue';

import { invalidatePortfolioState } from './invalidate-portfolio-state';

// Composable for creating an investment transaction
export const useCreateInvestmentTransaction = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createInvestmentTransaction,
    onSuccess: () => {
      invalidatePortfolioState({ queryClient });
    },
  });
};

export const useDeleteInvestmentTransaction = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteInvestmentTransaction,
    onSuccess: () => {
      invalidatePortfolioState({ queryClient });
    },
  });
};

export const usePortfolioInvestmentTransactions = (
  portfolioId: MaybeRef<string | undefined>,
  page: Ref<number>,
  limit: Ref<number>,
) => {
  const portfolioIdRef = toRef(portfolioId);
  const offset = computed(() => (page.value - 1) * limit.value);

  return useQuery<HoldingTransactionsResponse | undefined>({
    queryKey: [...VUE_QUERY_CACHE_KEYS.portfolioInvestmentTransactions, portfolioIdRef, page, limit],
    queryFn: () => {
      if (!portfolioIdRef.value) return Promise.resolve(undefined);
      return getPortfolioInvestmentTransactions({
        portfolioId: portfolioIdRef.value,
        limit: limit.value,
        offset: offset.value,
      });
    },
    enabled: computed(() => !!portfolioIdRef.value),
  });
};

export const useGetHoldingTransactionsInfinite = (
  portfolioId: MaybeRef<string | undefined>,
  securityId: MaybeRef<string | undefined>,
  pageSize = 30,
) => {
  const portfolioIdRef = toRef(portfolioId);
  const securityIdRef = toRef(securityId);

  return useInfiniteQuery<HoldingTransactionsResponse>({
    queryKey: [...VUE_QUERY_CACHE_KEYS.holdingTransactions, 'infinite', portfolioIdRef, securityIdRef, pageSize],
    queryFn: ({ pageParam = 0 }) =>
      getHoldingTransactions({
        portfolioId: portfolioIdRef.value!,
        securityId: securityIdRef.value!,
        limit: pageSize,
        offset: pageParam as number,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => {
      const loadedSoFar = lastPage.offset + lastPage.transactions.length;
      return loadedSoFar < lastPage.total ? loadedSoFar : undefined;
    },
    enabled: computed(() => !!portfolioIdRef.value && !!securityIdRef.value),
  });
};
