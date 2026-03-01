import { getPortfolioBalances } from '@/api/portfolios';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import { useQuery } from '@tanstack/vue-query';
import { type MaybeRefOrGetter, computed, unref } from 'vue';

export const usePortfolioBalances = (portfolioId: MaybeRefOrGetter<number>) => {
  const portfolioIdRef = computed(() => unref(portfolioId));

  return useQuery({
    queryKey: [...VUE_QUERY_CACHE_KEYS.portfolioBalances, portfolioIdRef],
    queryFn: () => getPortfolioBalances({ portfolioId: unref(portfolioId) as number }),
    enabled: computed(() => {
      const id = unref(portfolioId) as number;
      return typeof id === 'number' && id > 0;
    }),
    staleTime: 5 * 60 * 1000,
  });
};
