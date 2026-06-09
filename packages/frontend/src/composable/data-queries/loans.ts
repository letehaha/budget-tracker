import { createLoan, getLoanById, getLoans } from '@/api/loans';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { type MaybeRef, computed, unref } from 'vue';

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

export const useCreateLoan = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createLoan,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.loansList });
    },
  });
};

export const useLoanById = ({ id }: { id: MaybeRef<string> }) => {
  const queryClient = useQueryClient();

  const queryKey = computed(() => [...VUE_QUERY_CACHE_KEYS.loanDetail, unref(id)] as const);

  const query = useQuery({
    queryFn: () => getLoanById({ id: unref(id) }),
    queryKey,
    staleTime: 1000 * 60 * 5,
    enabled: computed(() => Boolean(unref(id))),
  });

  return {
    ...query,
    invalidate: () => queryClient.invalidateQueries({ queryKey: queryKey.value }),
  };
};
