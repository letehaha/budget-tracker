import { getPortfoliosAnnualizedReturns } from '@/api/portfolios';
import { QUERY_CACHE_STALE_TIME, VUE_QUERY_CACHE_KEYS } from '@/common/const';
import { useQuery } from '@tanstack/vue-query';

export const usePortfoliosAnnualizedReturns = () =>
  useQuery({
    queryKey: VUE_QUERY_CACHE_KEYS.portfolioAnnualizedReturns,
    queryFn: getPortfoliosAnnualizedReturns,
    staleTime: QUERY_CACHE_STALE_TIME.ANALYTICS,
  });
