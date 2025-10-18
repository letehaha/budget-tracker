import { loadAccountGroups } from '@/api/account-groups';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import { AccountGroups } from '@/common/types/models';
import { useQuery, useQueryClient } from '@tanstack/vue-query';
import { Ref } from 'vue';

export const useAccountGroupForAccount = (
  accountId: Ref<number | string>,
  queryOptions: Partial<Parameters<typeof useQuery<AccountGroups | null, Error>>[0]> = {},
) => {
  const queryClient = useQueryClient();
  const query = useQuery<AccountGroups | null>({
    queryFn: async () => {
      const result = await loadAccountGroups({
        accountIds: [Number(accountId.value)],
        hidden: true,
      });
      return result.length ? result[0] : null;
    },
    queryKey: [...VUE_QUERY_CACHE_KEYS.accountGroupForAccount, accountId],
    staleTime: Infinity,
    ...queryOptions,
  });
  const invalidate = () => {
    queryClient.invalidateQueries({
      queryKey: [...VUE_QUERY_CACHE_KEYS.accountGroupForAccount, accountId.value],
    });
  };
  return {
    group: query.data,
    invalidate,
    refetch: query.refetch,
    ...query,
  };
};
