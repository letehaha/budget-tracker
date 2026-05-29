import { createVentureEvent, deleteVentureEvent, listVentureEvents } from '@/api/venture/events';
import { VUE_QUERY_CACHE_KEYS, VUE_QUERY_GLOBAL_PREFIXES } from '@/common/const';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { type MaybeRefOrGetter, toValue } from 'vue';

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
 * Invalidates everything touched by an event mutation: every venture-prefixed
 * query (events list, deal details, metrics, deals list, balance trend) plus
 * any transaction-derived queries (linked-mode events create/restore real
 * transactions, so balances and tx lists must refresh).
 */
const invalidateAllForDeal = (queryClient: ReturnType<typeof useQueryClient>) => {
  queryClient.invalidateQueries({
    predicate: (q) =>
      Array.isArray(q.queryKey) &&
      (q.queryKey.includes(VUE_QUERY_GLOBAL_PREFIXES.ventureChange) ||
        q.queryKey.includes(VUE_QUERY_GLOBAL_PREFIXES.transactionChange)),
  });
};

export const useCreateVentureEvent = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createVentureEvent,
    onSuccess: () => invalidateAllForDeal(queryClient),
  });
};

export const useDeleteVentureEvent = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteVentureEvent,
    onSuccess: () => invalidateAllForDeal(queryClient),
  });
};
