import { getEarliestTransactionDate } from '@/api';
import { QUERY_CACHE_STALE_TIME, VUE_QUERY_CACHE_KEYS } from '@/common/const';
import { useQuery } from '@tanstack/vue-query';
import { parseISO } from 'date-fns';
import { computed } from 'vue';

export const useEarliestTransactionDate = () => {
  const query = useQuery({
    queryKey: VUE_QUERY_CACHE_KEYS.earliestTransactionDate,
    queryFn: getEarliestTransactionDate,
    staleTime: QUERY_CACHE_STALE_TIME.ANALYTICS,
    gcTime: QUERY_CACHE_STALE_TIME.ANALYTICS * 2,
  });

  const earliestDate = computed(() => {
    if (!query.data.value) return undefined;
    return parseISO(query.data.value);
  });

  return {
    ...query,
    earliestDate,
  };
};
