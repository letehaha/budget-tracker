import { createPortfolio, deletePortfolio, getPortfolio, getPortfolios, updatePortfolio } from '@/api/portfolios';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { type MaybeRef, unref } from 'vue';

// Portfolio creation composable
export const useCreatePortfolio = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createPortfolio,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.portfoliosList });
    },
  });
};

// Portfolio listing composable
export const usePortfolios = (queryOptions = {}) => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryFn: getPortfolios,
    queryKey: VUE_QUERY_CACHE_KEYS.portfoliosList,
    staleTime: 1000 * 60 * 5, // 5 minutes
    ...queryOptions,
  });

  return {
    ...query,
    invalidate: () => queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.portfoliosList }),
  };
};

// Individual portfolio composable
export const usePortfolio = (portfolioId: MaybeRef<number | undefined>, queryOptions = {}) => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryFn: () => getPortfolio(unref(portfolioId)!),
    queryKey: [...VUE_QUERY_CACHE_KEYS.portfolioDetails, portfolioId],
    enabled: () => !!unref(portfolioId),
    staleTime: 1000 * 60 * 5, // 5 minutes
    ...queryOptions,
  });

  return {
    ...query,
    invalidate: () =>
      queryClient.invalidateQueries({ queryKey: [...VUE_QUERY_CACHE_KEYS.portfoliosList, unref(portfolioId)] }),
  };
};

// Portfolio update composable
export const useUpdatePortfolio = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ portfolioId, ...rest }: { portfolioId: number } & Parameters<typeof updatePortfolio>[1]) =>
      updatePortfolio(portfolioId, rest),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.portfoliosList });
    },
  });
};

// Portfolio deletion composable
export const useDeletePortfolio = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (portfolioId: number) => deletePortfolio(portfolioId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.portfoliosList });
    },
  });
};
