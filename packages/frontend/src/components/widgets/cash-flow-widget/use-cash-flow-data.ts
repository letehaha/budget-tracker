import { getCashFlow } from '@/api/stats';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import { useRootStore } from '@/stores';
import { useQuery } from '@tanstack/vue-query';
import { storeToRefs } from 'pinia';
import { computed } from 'vue';

import {
  type CashFlowTotals,
  computePrevPeriod,
  computeTrendPeriods,
  isFullMonthPeriod,
  sliceCashFlowTotals,
} from './helpers';

const ZERO_TOTALS: CashFlowTotals = { income: 0, expenses: 0, netFlow: 0, savingsRate: 0 };

/**
 * Owns all cash-flow data loading for the widget.
 *
 * The widget renders three things over three date ranges: the current period,
 * the previous period (for the "vs previous" badge) and the previous few periods
 * (for the trend bars). When the selected period is a whole calendar month those
 * ranges are month-aligned, so a single monthly call over the widest span
 * (`unionRange`) contains every month they need and the current/previous months
 * are sliced from it. Non-month-aligned (custom) ranges can't be reconstructed
 * from monthly buckets, so the current and previous periods fall back to their
 * own exact calls there.
 */
export function useCashFlowData({ selectedPeriod }: { selectedPeriod: () => { from: Date; to: Date } }) {
  const { isAppInitialized } = storeToRefs(useRootStore());

  const periodQueryKey = computed(() => `${selectedPeriod().from.toISOString()}-${selectedPeriod().to.toISOString()}`);

  const isFullMonth = computed(() => isFullMonthPeriod(selectedPeriod()));
  const prevPeriod = computed(() => computePrevPeriod(selectedPeriod()));
  const trendPeriods = computed(() => computeTrendPeriods(selectedPeriod()));

  const trendRange = computed(() => {
    const past = trendPeriods.value.filter((p) => !p.isCurrent);
    return { from: past[0]!.from, to: past[past.length - 1]!.to };
  });

  // Widest span the widget needs: the start of the trend range through the end
  // of the current period. In the month-aligned case this single monthly call
  // covers the current month, the previous month and every trend month.
  const unionRange = computed(() => ({ from: trendRange.value.from, to: selectedPeriod().to }));

  const { data: unionData, isFetching: isUnionFetching } = useQuery({
    queryKey: computed(() => [...VUE_QUERY_CACHE_KEYS.widgetCashFlowTrend, periodQueryKey.value]),
    queryFn: () => getCashFlow({ from: unionRange.value.from, to: unionRange.value.to, granularity: 'monthly' }),
    staleTime: Infinity,
    placeholderData: (prev) => prev,
    enabled: isAppInitialized,
  });

  const useExactRanges = computed(() => isAppInitialized.value && !isFullMonth.value);

  const { data: currentExactData, isFetching: isCurrentFetching } = useQuery({
    queryKey: computed(() => [...VUE_QUERY_CACHE_KEYS.widgetCashFlow, periodQueryKey.value]),
    queryFn: () => getCashFlow({ from: selectedPeriod().from, to: selectedPeriod().to, granularity: 'monthly' }),
    staleTime: Infinity,
    placeholderData: (prev) => prev,
    enabled: useExactRanges,
  });

  const { data: prevExactData, isFetching: isPrevFetching } = useQuery({
    queryKey: computed(() => [...VUE_QUERY_CACHE_KEYS.widgetCashFlowPrev, periodQueryKey.value]),
    queryFn: () => getCashFlow({ from: prevPeriod.value.from, to: prevPeriod.value.to, granularity: 'monthly' }),
    staleTime: Infinity,
    placeholderData: (prev) => prev,
    enabled: useExactRanges,
  });

  const hasCurrentData = computed(() => (isFullMonth.value ? !!unionData.value : !!currentExactData.value));
  const hasPrevData = computed(() => (isFullMonth.value ? !!unionData.value : !!prevExactData.value));

  const currentTotals = computed<CashFlowTotals>(() => {
    if (isFullMonth.value) {
      if (!unionData.value) return ZERO_TOTALS;
      return sliceCashFlowTotals({
        periods: unionData.value.periods,
        from: selectedPeriod().from,
        to: selectedPeriod().to,
      });
    }
    return currentExactData.value?.totals ?? ZERO_TOTALS;
  });

  const prevNetFlow = computed(() => {
    if (isFullMonth.value) {
      if (!unionData.value) return 0;
      return sliceCashFlowTotals({
        periods: unionData.value.periods,
        from: prevPeriod.value.from,
        to: prevPeriod.value.to,
      }).netFlow;
    }
    return prevExactData.value?.totals.netFlow ?? 0;
  });

  const unionPeriods = computed(() => unionData.value?.periods ?? []);

  const isFetching = computed(() => isUnionFetching.value || isCurrentFetching.value || isPrevFetching.value);
  const isInitialLoading = computed(() => isFetching.value && !hasCurrentData.value);
  const isEmpty = computed(
    () => hasCurrentData.value && currentTotals.value.income === 0 && currentTotals.value.expenses === 0,
  );

  return {
    currentTotals,
    prevNetFlow,
    trendPeriods,
    unionPeriods,
    hasCurrentData,
    hasPrevData,
    isFetching,
    isInitialLoading,
    isEmpty,
  };
}
