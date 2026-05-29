import {
  createVentureDeal,
  deleteVentureDeal,
  getVentureDeal,
  listVentureDeals,
  updateVentureDeal,
} from '@/api/venture/deals';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { type MaybeRef, unref } from 'vue';

export const useVentureDeals = (queryOptions = {}) => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryFn: () => listVentureDeals({ limit: 100 }),
    queryKey: VUE_QUERY_CACHE_KEYS.ventureDealsList,
    staleTime: 1000 * 60 * 5,
    ...queryOptions,
  });

  return {
    ...query,
    invalidate: () => queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.ventureDealsList }),
  };
};

export const useVentureDeal = (
  dealId: MaybeRef<string | undefined>,
  options: { includeEvents?: boolean } & Record<string, unknown> = {},
) => {
  const queryClient = useQueryClient();
  const { includeEvents, ...queryOptions } = options;

  const query = useQuery({
    queryFn: () => getVentureDeal({ dealId: unref(dealId)!, includeEvents }),
    queryKey: [...VUE_QUERY_CACHE_KEYS.ventureDealDetails, dealId, includeEvents],
    enabled: () => !!unref(dealId),
    staleTime: 1000 * 60 * 5,
    ...queryOptions,
  });

  return {
    ...query,
    invalidate: () =>
      queryClient.invalidateQueries({
        queryKey: [...VUE_QUERY_CACHE_KEYS.ventureDealDetails, unref(dealId)],
      }),
  };
};

export const useCreateVentureDeal = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createVentureDeal,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.ventureDealsList });
    },
  });
};

export const useUpdateVentureDeal = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: Parameters<typeof updateVentureDeal>[0]) => updateVentureDeal(params),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.ventureDealsList });
      queryClient.invalidateQueries({
        queryKey: [...VUE_QUERY_CACHE_KEYS.ventureDealDetails, variables.dealId],
      });
    },
  });
};

export const useDeleteVentureDeal = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (dealId: string) => deleteVentureDeal({ dealId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.ventureDealsList });
    },
  });
};
