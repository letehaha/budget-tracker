import { getPortfolioSummary } from '@/api/portfolios';
import { useQuery } from '@tanstack/vue-query';
import { computed, unref, type MaybeRefOrGetter } from 'vue';

export const usePortfolioSummary = (portfolioId: MaybeRefOrGetter<number>, date?: MaybeRefOrGetter<string>) => {
  const portfolioIdRef = computed(() => unref(portfolioId));
  const dateRef = computed(() => date ? unref(date) : undefined);

  return useQuery({
    queryKey: ['portfolioSummary', portfolioIdRef, dateRef],
    queryFn: async () => {
      const id = unref(portfolioIdRef);
      const dateValue = unref(dateRef);
      return await getPortfolioSummary(id, dateValue);
    },
    enabled: computed(() => {
      const id = unref(portfolioIdRef);
      return typeof id === 'number' && id > 0;
    }),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};