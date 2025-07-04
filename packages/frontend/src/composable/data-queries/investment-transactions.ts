import {
  HoldingTransactionsResponse,
  createInvestmentTransaction,
  deleteInvestmentTransaction,
  getHoldingTransactions,
} from '@/api/investment-transactions';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { MaybeRef, Ref, computed, toRef } from 'vue';

// Composable for creating an investment transaction
export const useCreateInvestmentTransaction = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createInvestmentTransaction,
    onSuccess: (_, variables: { portfolioId: number }) => {
      // Invalidate holdings and portfolio queries to refetch data
      queryClient.invalidateQueries({ queryKey: ['holdings', variables.portfolioId] });
      queryClient.invalidateQueries({ queryKey: ['portfolio', variables.portfolioId] });
      // Invalidate holding-transactions queries to refresh transaction lists
      queryClient.invalidateQueries({ queryKey: ['holding-transactions'] });
    },
  });
};

export const useDeleteInvestmentTransaction = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteInvestmentTransaction,
    onSuccess: () => {
      // Invalidate all related queries to refetch data
      queryClient.invalidateQueries({ queryKey: ['holding-transactions'] });
      queryClient.invalidateQueries({ queryKey: ['holdings'] });
      queryClient.invalidateQueries({ queryKey: ['portfolio'] });
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
    queryKey: ['holding-transactions', portfolioIdRef, securityIdRef, page, limit],
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
