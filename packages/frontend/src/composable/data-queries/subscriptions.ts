import { type SubscriptionListItem, loadSubscriptions } from '@/api/subscriptions';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import { useQuery } from '@tanstack/vue-query';
import { type MaybeRefOrGetter, computed, toValue } from 'vue';

type SubscriptionsListFilter = {
  isActive?: boolean;
  type?: string;
  sortBy?: string;
};

// Fold the filter into the cache key so each distinct filter is its own entry:
// identical filters (e.g. several widgets all requesting active-only) dedupe to a
// single request, while an unfiltered read stays separate from a filtered one. An
// empty filter uses the bare key, so `invalidateQueries({ queryKey: subscriptionsList })`
// still refreshes every filtered entry via prefix match.
const subscriptionsListKey = (filter: SubscriptionsListFilter) =>
  Object.keys(filter).length > 0
    ? ([...VUE_QUERY_CACHE_KEYS.subscriptionsList, filter] as const)
    : VUE_QUERY_CACHE_KEYS.subscriptionsList;

/**
 * Subscriptions list query. Callers pass only the filter and the standard knobs
 * (enabled / staleTime); the cache key is derived from the filter here, so no
 * call site has to know the key layout or keep the dedupe convention in sync.
 */
export const useSubscriptionsList = ({
  filter,
  enabled,
  staleTime = Infinity,
}: {
  filter?: MaybeRefOrGetter<SubscriptionsListFilter>;
  enabled?: MaybeRefOrGetter<boolean>;
  staleTime?: number;
} = {}) => {
  const query = useQuery({
    queryKey: computed(() => subscriptionsListKey(toValue(filter) ?? {})),
    queryFn: () => loadSubscriptions(toValue(filter) ?? {}),
    enabled: computed(() => (enabled === undefined ? true : toValue(enabled))),
    staleTime,
    placeholderData: [],
  });

  const list = computed<SubscriptionListItem[]>(() => query.data.value ?? []);

  return { ...query, list };
};
