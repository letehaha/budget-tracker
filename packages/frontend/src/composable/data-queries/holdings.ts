import { type CreateHoldingRequest, createHolding, deleteHolding, getHoldings } from '@/api/holdings';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { type MaybeRef, unref } from 'vue';

export const useHoldings = (portfolioId: MaybeRef<number | undefined>, queryOptions = {}) => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['holdings', portfolioId],
    queryFn: () => getHoldings(unref(portfolioId)!),
    enabled: () => !!unref(portfolioId),
    staleTime: 1000 * 60 * 5,
    ...queryOptions,
  });

  return {
    ...query,
    invalidate: () => queryClient.invalidateQueries({ queryKey: ['holdings', unref(portfolioId)] }),
  };
};

export const useCreateHolding = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateHoldingRequest) => createHolding(payload),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['holdings', variables.portfolioId] });
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
      queryClient.invalidateQueries({ queryKey: ['holdings'] });
    },
  });
};
