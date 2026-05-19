import { getPortfolioBalances } from '@/api/portfolios';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import { useQuery } from '@tanstack/vue-query';
import { type MaybeRefOrGetter, computed, unref } from 'vue';

export const usePortfolioBalances = (portfolioId: MaybeRefOrGetter<string>) => {
  const portfolioIdRef = computed(() => unref(portfolioId));

  return useQuery({
    queryKey: [...VUE_QUERY_CACHE_KEYS.portfolioBalances, portfolioIdRef],
    queryFn: () => getPortfolioBalances({ portfolioId: unref(portfolioId) as string }),
    enabled: computed(() => {
      const id = unref(portfolioId) as string;
      return typeof id === 'string' && id.length > 0;
    }),
    staleTime: 5 * 60 * 1000,
  });
};
