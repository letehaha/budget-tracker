import { type CreateHoldingRequest, createHolding, deleteHolding, getHoldings } from '@/api/holdings';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { type MaybeRef, unref } from 'vue';

export const useHoldings = (portfolioId: MaybeRef<number | undefined>, queryOptions = {}) => {
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
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [...VUE_QUERY_CACHE_KEYS.holdingsList, variables.portfolioId] });
    },
  });
};

/** @public */
export const useDeleteHolding = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (holdingId: number) => deleteHolding(holdingId),
    onSuccess: () => {
      // holdings query key includes portfolioId, but we don't have it here; just invalidate all holdings queries
      queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.holdingsList });
    },
  });
};
