import { getPortfolioSummary } from '@/api/portfolios';
import { useQuery } from '@tanstack/vue-query';
import { type MaybeRefOrGetter, computed, unref } from 'vue';

export const usePortfolioSummary = (portfolioId: MaybeRefOrGetter<number>, date?: MaybeRefOrGetter<string>) => {
  const portfolioIdRef = computed(() => unref(portfolioId));
  const dateRef = computed(() => (date ? unref(date) : undefined));

  return useQuery({
    queryKey: ['portfolioSummary', portfolioIdRef, dateRef],
    queryFn: async () => {
      const id = unref(portfolioId) as number;
      const dateValue = date ? (unref(date) as string) : undefined;
      return await getPortfolioSummary(id, dateValue);
    },
    enabled: computed(() => {
      const id = unref(portfolioId) as number;
      return typeof id === 'number' && id > 0;
    }),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};
