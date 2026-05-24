import { type CreateHoldingRequest, createHolding, deleteHolding, getHoldings } from '@/api/holdings';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { type MaybeRef, unref } from 'vue';

import { invalidatePortfolioState } from './invalidate-portfolio-state';

export const useHoldings = (portfolioId: MaybeRef<string | undefined>, queryOptions = {}) => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: [...VUE_QUERY_CACHE_KEYS.holdingsList, portfolioId],
    queryFn: () => getHoldings(unref(portfolioId)!),
    enabled: () => !!unref(portfolioId),
    staleTime: 1000 * 60 * 5,
    ...queryOptions,
  });

  return {
    ...query,
    invalidate: () =>
      queryClient.invalidateQueries({ queryKey: [...VUE_QUERY_CACHE_KEYS.holdingsList, unref(portfolioId)] }),
  };
};

export const useCreateHolding = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateHoldingRequest) => createHolding(payload),
    onSuccess: () => {
      invalidatePortfolioState({ queryClient });
    },
  });
};

export const useDeleteHolding = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: { portfolioId: string; securityId: string; force?: boolean }) => deleteHolding(payload),
    onSuccess: () => {
      invalidatePortfolioState({ queryClient });
    },
  });
};
