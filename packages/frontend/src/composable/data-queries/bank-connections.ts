import { listConnections } from '@/api/bank-data-providers';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import { useQuery } from '@tanstack/vue-query';

export const useBankConnectionsQuery = () =>
  useQuery({
    queryKey: VUE_QUERY_CACHE_KEYS.bankConnections,
    queryFn: listConnections,
    staleTime: Infinity,
  });
