import { createPortfolioTransfer, getPortfolioTransfers } from '@/api/portfolios';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { type MaybeRef, unref } from 'vue';

// Transfer types for external use
export type TransferContext = 'portfolio' | 'account';
export type TransferType = 'portfolio-to-portfolio' | 'portfolio-to-account' | 'account-to-portfolio';

// Portfolio transfer mutations composable - focused on API operations only
export const useCreatePortfolioTransfer = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      fromPortfolioId,
      ...params
    }: { fromPortfolioId: number } & Parameters<typeof createPortfolioTransfer>[1]) =>
      createPortfolioTransfer(fromPortfolioId, params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.portfolioTransfers });
      queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.portfoliosList });
      queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.allAccounts });
    },
  });
};

// Portfolio transfers listing composable - focused on data fetching only
/** @public */
export const usePortfolioTransfers = (portfolioId: MaybeRef<number | undefined>, queryOptions = {}) => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryFn: () => getPortfolioTransfers(unref(portfolioId)!),
    queryKey: [...VUE_QUERY_CACHE_KEYS.portfolioTransfers, portfolioId],
    enabled: () => !!unref(portfolioId),
    staleTime: 1000 * 60 * 5, // 5 minutes
    ...queryOptions,
  });

  return {
    ...query,
    invalidate: () =>
      queryClient.invalidateQueries({ queryKey: [...VUE_QUERY_CACHE_KEYS.portfolioTransfers, unref(portfolioId)] }),
  };
};
