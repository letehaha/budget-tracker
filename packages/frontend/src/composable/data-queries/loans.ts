import { getLoans } from '@/api/loans';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import { useQuery, useQueryClient } from '@tanstack/vue-query';

export const useLoans = (queryOptions = {}) => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryFn: getLoans,
    queryKey: VUE_QUERY_CACHE_KEYS.loansList,
    staleTime: 1000 * 60 * 5,
    ...queryOptions,
  });

  return {
    ...query,
    invalidate: () => queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.loansList }),
  };
};
