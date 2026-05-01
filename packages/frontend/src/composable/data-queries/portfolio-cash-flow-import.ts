import { detectCashFlowDuplicates, executeCashFlowImport, extractCashFlows } from '@/api/portfolio-cash-flow-import';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const/vue-query';
import { useMutation, useQueryClient } from '@tanstack/vue-query';

export const useExtractCashFlows = () =>
  useMutation({
    mutationFn: extractCashFlows,
  });

export const useDetectCashFlowDuplicates = () =>
  useMutation({
    mutationFn: detectCashFlowDuplicates,
  });

export const useExecuteCashFlowImport = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: executeCashFlowImport,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.portfolioTransfers });
      queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.portfolioBalances });
      queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.portfolioExtendedStats });
    },
  });
};
