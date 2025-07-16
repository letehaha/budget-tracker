import { createPortfolio, deletePortfolio, getPortfolio, getPortfolios, updatePortfolio } from '@/api/portfolios';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { type MaybeRef, unref } from 'vue';

// Portfolio creation composable
export const useCreatePortfolio = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createPortfolio,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portfolios'] });
    },
  });
};

// Portfolio listing composable
export const usePortfolios = (queryOptions = {}) => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryFn: getPortfolios,
    queryKey: ['portfolios'],
    staleTime: 1000 * 60 * 5, // 5 minutes
    ...queryOptions,
  });

  return {
    ...query,
    invalidate: () => queryClient.invalidateQueries({ queryKey: ['portfolios'] }),
  };
};

// Individual portfolio composable
export const usePortfolio = (portfolioId: MaybeRef<number | undefined>, queryOptions = {}) => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryFn: () => getPortfolio(unref(portfolioId)!),
    queryKey: ['portfolio', portfolioId],
    enabled: () => !!unref(portfolioId),
    staleTime: 1000 * 60 * 5, // 5 minutes
    ...queryOptions,
  });

  return {
    ...query,
    invalidate: () => queryClient.invalidateQueries({ queryKey: ['portfolio', unref(portfolioId)] }),
  };
};

// Portfolio update composable
export const useUpdatePortfolio = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ portfolioId, ...rest }: { portfolioId: number } & Parameters<typeof updatePortfolio>[1]) =>
      updatePortfolio(portfolioId, rest),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portfolios'] });
    },
  });
};

// Portfolio deletion composable
export const useDeletePortfolio = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (portfolioId: number) => deletePortfolio(portfolioId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portfolios'] });
    },
  });
};
