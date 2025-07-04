import { createPortfolioTransfer, getPortfolioTransfers } from '@/api/portfolios';
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
      queryClient.invalidateQueries({ queryKey: ['portfolio-transfers'] });
      queryClient.invalidateQueries({ queryKey: ['portfolios'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
  });
};

// Portfolio transfers listing composable - focused on data fetching only
export const usePortfolioTransfers = (portfolioId: MaybeRef<number | undefined>, queryOptions = {}) => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryFn: () => getPortfolioTransfers(unref(portfolioId)!),
    queryKey: ['portfolio-transfers', portfolioId],
    enabled: () => !!unref(portfolioId),
    staleTime: 1000 * 60 * 5, // 5 minutes
    ...queryOptions,
  });

  return {
    ...query,
    invalidate: () => queryClient.invalidateQueries({ queryKey: ['portfolio-transfers', unref(portfolioId)] }),
  };
};
