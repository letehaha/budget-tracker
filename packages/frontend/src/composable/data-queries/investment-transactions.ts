import {
  HoldingTransactionsResponse,
  createInvestmentTransaction,
  deleteInvestmentTransaction,
  getHoldingTransactions,
} from '@/api/investment-transactions';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { MaybeRef, Ref, computed, toRef } from 'vue';

// Composable for creating an investment transaction
export const useCreateInvestmentTransaction = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createInvestmentTransaction,
    onSuccess: (_, variables) => {
      const { portfolioId } = variables as { portfolioId: number };
      // Invalidate holdings and portfolio queries to refetch data
      queryClient.invalidateQueries({ queryKey: [...VUE_QUERY_CACHE_KEYS.holdingsList, portfolioId] });
      queryClient.invalidateQueries({ queryKey: [...VUE_QUERY_CACHE_KEYS.portfolioDetails, portfolioId] });
      // Invalidate holding-transactions queries to refresh transaction lists
      queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.holdingTransactions });
    },
  });
};

export const useDeleteInvestmentTransaction = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteInvestmentTransaction,
    onSuccess: () => {
      // Invalidate all related queries to refetch data
      queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.holdingTransactions });
      queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.holdingsList });
      queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.portfolioDetails });
    },
  });
};

export const useGetHoldingTransactions = (
  portfolioId: MaybeRef<number | undefined>,
  securityId: MaybeRef<number | undefined>,
  page: Ref<number>,
  limit: Ref<number>,
) => {
  const portfolioIdRef = toRef(portfolioId);
  const securityIdRef = toRef(securityId);

  const offset = computed(() => (page.value - 1) * limit.value);

  return useQuery<HoldingTransactionsResponse | undefined>({
    queryKey: [...VUE_QUERY_CACHE_KEYS.holdingTransactions, portfolioIdRef, securityIdRef, page, limit],
    queryFn: () => {
      if (!portfolioIdRef.value || !securityIdRef.value) {
        return Promise.resolve(undefined);
      }
      return getHoldingTransactions({
        portfolioId: portfolioIdRef.value,
        securityId: securityIdRef.value,
        limit: limit.value,
        offset: offset.value,
      });
    },
    enabled: computed(() => !!portfolioIdRef.value && !!securityIdRef.value),
  });
};
