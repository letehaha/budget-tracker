import {
  accountToPortfolioTransfer,
  createDirectCashTransaction,
  createPortfolioTransfer,
  deletePortfolioTransfer,
  getPortfolioTransfers,
  getTransactionPortfolioLink,
  linkTransactionToPortfolio,
  portfolioToAccountTransfer,
  unlinkTransactionFromPortfolio,
} from '@/api/portfolios';
import { VUE_QUERY_CACHE_KEYS, VUE_QUERY_GLOBAL_PREFIXES } from '@/common/const';
import type { QueryClient } from '@tanstack/vue-query';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { type MaybeRef, unref } from 'vue';

// Transfer types for external use
export type TransferContext = 'portfolio' | 'account';
export type TransferType = 'portfolio-to-portfolio' | 'portfolio-to-account' | 'account-to-portfolio';

/** Invalidates all queries affected by portfolio transfer operations. */
function invalidateTransferRelatedQueries(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.portfolioTransfers });
  queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.portfolioBalances });
  queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.portfolioSummary });
  queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.portfoliosList });
  queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.allAccounts });
}

export const useCreatePortfolioTransfer = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: Parameters<typeof createPortfolioTransfer>[0]) => createPortfolioTransfer(params),
    onSuccess: () => invalidateTransferRelatedQueries(queryClient),
  });
};

export const useAccountToPortfolioTransfer = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: Parameters<typeof accountToPortfolioTransfer>[0]) => accountToPortfolioTransfer(params),
    onSuccess: () => invalidateTransferRelatedQueries(queryClient),
  });
};

export const usePortfolioToAccountTransfer = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: Parameters<typeof portfolioToAccountTransfer>[0]) => portfolioToAccountTransfer(params),
    onSuccess: () => invalidateTransferRelatedQueries(queryClient),
  });
};

export const useCreateDirectCashTransaction = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: Parameters<typeof createDirectCashTransaction>[0]) => createDirectCashTransaction(params),
    onSuccess: () => invalidateTransferRelatedQueries(queryClient),
  });
};

export const useDeletePortfolioTransfer = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: { portfolioId: number; transferId: number; deleteLinkedTransaction?: boolean }) =>
      deletePortfolioTransfer(params),
    onSuccess: () => invalidateTransferRelatedQueries(queryClient),
  });
};

export const useLinkTransactionToPortfolio = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: Parameters<typeof linkTransactionToPortfolio>[0]) => linkTransactionToPortfolio(params),
    onSuccess: () => {
      invalidateTransferRelatedQueries(queryClient);
      queryClient.invalidateQueries({ queryKey: [VUE_QUERY_GLOBAL_PREFIXES.transactionChange] });
    },
  });
};

export const useTransactionPortfolioLink = (transactionId: MaybeRef<number | undefined>) => {
  return useQuery({
    queryFn: () => getTransactionPortfolioLink({ transactionId: unref(transactionId)! }),
    queryKey: [...VUE_QUERY_CACHE_KEYS.transactionPortfolioLink, transactionId],
    enabled: () => !!unref(transactionId),
  });
};

export const useUnlinkTransactionFromPortfolio = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: { transactionId: number }) => unlinkTransactionFromPortfolio(params),
    onSuccess: () => {
      invalidateTransferRelatedQueries(queryClient);
      queryClient.invalidateQueries({ queryKey: [VUE_QUERY_GLOBAL_PREFIXES.transactionChange] });
      queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.transactionPortfolioLink });
    },
  });
};

// Portfolio transfers listing composable - focused on data fetching only
/** @public */
export const usePortfolioTransfers = (portfolioId: MaybeRef<number | undefined>, queryOptions = {}) => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryFn: () => getPortfolioTransfers({ portfolioId: unref(portfolioId)! }),
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
