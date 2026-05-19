import { getConnectionDetails } from '@/api/bank-data-providers';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import { useQuery } from '@tanstack/vue-query';
import { MaybeRef, unref } from 'vue';

type ConnectionDetails = Awaited<ReturnType<typeof getConnectionDetails>>;

export const useBankConnectionDetails = ({
  connectionId,
  queryOptions = {},
}: {
  connectionId: MaybeRef<string>;
  queryOptions?: Partial<Parameters<typeof useQuery<ConnectionDetails, Error>>[0]>;
}) => {
  return useQuery({
    queryKey: [...VUE_QUERY_CACHE_KEYS.bankConnectionDetails, connectionId],
    queryFn: () => getConnectionDetails(unref(connectionId)),
    enabled: !!unref(connectionId),
    staleTime: 60 * 10_000,
    ...queryOptions,
  });
};
