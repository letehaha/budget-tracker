import {
  CreatePortfolioRequest,
  createPortfolio,
  deletePortfolio,
  getPortfolio,
  getPortfolios,
  updatePortfolio,
} from '@/api/portfolios';
import { PORTFOLIO_TYPE } from '@bt/shared/types/investments';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { MaybeRef, unref } from 'vue';

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
    mutationFn: ({
      portfolioId,
      params,
    }: {
      portfolioId: number;
      params: Partial<Omit<CreatePortfolioRequest, 'portfolioType'> & { portfolioType: PORTFOLIO_TYPE }>;
    }) => updatePortfolio(portfolioId, params),
    onSuccess: (data) => {
      queryClient.setQueryData(['portfolio', data.id], data);
      queryClient.invalidateQueries({ queryKey: ['portfolios'] });
    },
  });
};

// Portfolio deletion composable
export const useDeletePortfolio = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ portfolioId, force }: { portfolioId: number; force?: boolean }) =>
      deletePortfolio(portfolioId, force),
    onSuccess: (_, { portfolioId }) => {
      queryClient.removeQueries({ queryKey: ['portfolio', portfolioId] });
      queryClient.invalidateQueries({ queryKey: ['portfolios'] });
    },
  });
};
