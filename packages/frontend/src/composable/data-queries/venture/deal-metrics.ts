import { getVentureDealMetrics } from '@/api/venture/metrics';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import { useQuery, useQueryClient } from '@tanstack/vue-query';
import { type MaybeRef, unref } from 'vue';

export const useVentureDealMetrics = (dealId: MaybeRef<string | undefined>, queryOptions = {}) => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryFn: () => getVentureDealMetrics({ dealId: unref(dealId)! }),
    queryKey: [...VUE_QUERY_CACHE_KEYS.ventureDealMetrics, dealId],
    enabled: () => !!unref(dealId),
    staleTime: 1000 * 30, // 30s — metrics tied to events that change rarely
    ...queryOptions,
  });

  return {
    ...query,
    invalidate: () =>
      queryClient.invalidateQueries({
        queryKey: [...VUE_QUERY_CACHE_KEYS.ventureDealMetrics, unref(dealId)],
      }),
  };
};
