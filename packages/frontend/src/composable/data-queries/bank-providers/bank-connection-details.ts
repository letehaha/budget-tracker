import { getConnectionDetails } from '@/api/bank-data-providers';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import { useQuery } from '@tanstack/vue-query';
import { MaybeRef, unref } from 'vue';

export const useBankConnectionDetails = ({ connectionId }: { connectionId: MaybeRef<number> }) => {
  return useQuery({
    queryKey: [...VUE_QUERY_CACHE_KEYS.bankConnectionDetails, connectionId],
    queryFn: () => getConnectionDetails(unref(connectionId)),
    enabled: !!unref(connectionId),
    staleTime: 60 * 10_000,
  });
};
