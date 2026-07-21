import { usePortfolios } from '@/composable/data-queries/portfolios';
import { ROUTES_NAMES } from '@/routes/constants';
import { computed } from 'vue';
import { useRouter } from 'vue-router';

/**
 * Shared gate for analytics reports that require at least one portfolio. Exposes
 * the placeholder condition and the "start investing" navigation so each report
 * can fall back to an empty state instead of rendering an empty chart.
 */
export function usePortfolioGatedReport() {
  const router = useRouter();
  const { data: portfolios, isLoading: isPortfoliosLoading, isError: isPortfoliosError } = usePortfolios();

  const userHasPortfolios = computed(() => (portfolios.value ?? []).length > 0);

  // A failed portfolios fetch leaves the list empty too, so gate on the error: a
  // user who owns portfolios must not be shown the "start investing" placeholder
  // on a transient error.
  const showNoPortfoliosPlaceholder = computed(
    () => !isPortfoliosLoading.value && !isPortfoliosError.value && !userHasPortfolios.value,
  );

  const goToInvestments = () => router.push({ name: ROUTES_NAMES.investments });

  return { isPortfoliosLoading, userHasPortfolios, showNoPortfoliosPlaceholder, goToInvestments };
}
