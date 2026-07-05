import { getPortfolioSummary } from '@/api/portfolios';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import { useQuery } from '@tanstack/vue-query';
import { type MaybeRefOrGetter, computed, toValue } from 'vue';

const PORTFOLIO_SUMMARY_STALE_TIME = 5 * 60 * 1000; // 5 minutes

/**
 * Query definition for a single portfolio's summary. Both `usePortfolioSummary` (per row) and
 * the sidebar's roll-up `useQueries` build from this, so their cache keys stay identical and the
 * two dedupe to a single request per portfolio.
 */
export const portfolioSummaryQueryOptions = ({ portfolioId, date }: { portfolioId: string; date?: string }) => ({
  queryKey: [...VUE_QUERY_CACHE_KEYS.portfolioSummary, portfolioId, date] as const,
  queryFn: () => getPortfolioSummary({ portfolioId, date }),
  staleTime: PORTFOLIO_SUMMARY_STALE_TIME,
});

export const usePortfolioSummary = (portfolioId: MaybeRefOrGetter<string>, date?: MaybeRefOrGetter<string>) => {
  const options = computed(() =>
    portfolioSummaryQueryOptions({
      portfolioId: toValue(portfolioId),
      date: date ? toValue(date) : undefined,
    }),
  );

  return useQuery({
    queryKey: computed(() => options.value.queryKey),
    queryFn: () => options.value.queryFn(),
    enabled: computed(() => {
      const id = toValue(portfolioId);
      return typeof id === 'string' && id.length > 0;
    }),
    staleTime: PORTFOLIO_SUMMARY_STALE_TIME,
  });
};
