import { getPortfolioExtendedStats } from '@/api/portfolios';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import { useQuery } from '@tanstack/vue-query';
import { type MaybeRefOrGetter, computed, toValue } from 'vue';

interface UsePortfolioExtendedStatsOptions {
  enabled?: MaybeRefOrGetter<boolean>;
}

export const usePortfolioExtendedStats = (
  portfolioId: MaybeRefOrGetter<number>,
  options: UsePortfolioExtendedStatsOptions = {},
) => {
  const portfolioIdRef = computed(() => toValue(portfolioId));

  return useQuery({
    queryKey: [...VUE_QUERY_CACHE_KEYS.portfolioExtendedStats, portfolioIdRef],
    queryFn: () => getPortfolioExtendedStats({ portfolioId: portfolioIdRef.value }),
    enabled: computed(() => {
      const id = portfolioIdRef.value;
      const isValidId = typeof id === 'number' && id > 0;
      const optEnabled = options.enabled === undefined ? true : Boolean(toValue(options.enabled));
      return isValidId && optEnabled;
    }),
    // Backend caches for 12h; frontend can match the same staleness comfortably.
    staleTime: 5 * 60 * 1000,
  });
};
