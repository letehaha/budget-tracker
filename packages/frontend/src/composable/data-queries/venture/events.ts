import { createVentureEvent, deleteVentureEvent, listVentureEvents } from '@/api/venture/events';
import { VUE_QUERY_CACHE_KEYS, VUE_QUERY_GLOBAL_PREFIXES } from '@/common/const';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { type MaybeRefOrGetter, toValue, type MaybeRef, unref } from 'vue';

type DealIdSource = MaybeRefOrGetter<string | undefined>;

const eventsKey = (dealId: DealIdSource) => [...VUE_QUERY_CACHE_KEYS.ventureDealEvents, dealId];

export const useVentureEvents = (dealId: DealIdSource, queryOptions = {}) => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryFn: () => listVentureEvents({ dealId: toValue(dealId)! }),
    queryKey: eventsKey(dealId),
    enabled: () => !!toValue(dealId),
    staleTime: 1000 * 30,
    ...queryOptions,
  });

  return {
    ...query,
    invalidate: () => queryClient.invalidateQueries({ queryKey: eventsKey(toValue(dealId)) }),
  };
};

/**
 * Invalidates everything touched by an event mutation: events list, deal
 * details (status may have flipped), metrics, and any transaction-derived
 * queries (linked-mode events create/restore real transactions, so balances
 * and tx lists must refresh).
 */
const invalidateAllForDeal = (queryClient: ReturnType<typeof useQueryClient>, dealId: string) => {
  queryClient.invalidateQueries({ queryKey: eventsKey(dealId) });
  queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.ventureDealsList });
  queryClient.invalidateQueries({ queryKey: [...VUE_QUERY_CACHE_KEYS.ventureDealDetails, dealId] });
  queryClient.invalidateQueries({ queryKey: [...VUE_QUERY_CACHE_KEYS.ventureDealMetrics, dealId] });
  queryClient.invalidateQueries({
    predicate: (q) => Array.isArray(q.queryKey) && q.queryKey.includes(VUE_QUERY_GLOBAL_PREFIXES.transactionChange),
  });
};

export const useCreateVentureEvent = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createVentureEvent,
    onSuccess: (_data, variables) => {
      invalidateAllForDeal(queryClient, variables.dealId);
    },
  });
};

export const useDeleteVentureEvent = (dealId: MaybeRef<string | undefined>) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteVentureEvent,
    onSuccess: () => {
      const id = unref(dealId);
      if (id) invalidateAllForDeal(queryClient, id);
    },
  });
};
