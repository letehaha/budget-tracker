import { getCashFlow, getCombinedBalanceHistory } from '@/api';
import { QUERY_CACHE_STALE_TIME, VUE_QUERY_CACHE_KEYS } from '@/common/const';
import type { endpointsTypes } from '@bt/shared/types';
import { useQuery } from '@tanstack/vue-query';
import { endOfMonth, startOfMonth, subMonths } from 'date-fns';
import { computed, type Ref } from 'vue';

export type NetIncomePeriod = '3mo' | '6mo' | '12mo' | 'all';

const PERIOD_MONTHS: Record<Exclude<NetIncomePeriod, 'all'>, number> = {
  '3mo': 3,
  '6mo': 6,
  '12mo': 12,
};

export function useSeedData({ selectedPeriod }: { selectedPeriod: Ref<NetIncomePeriod> }) {
  // Fetch combined balance history to get the latest total balance
  const { data: balanceHistory } = useQuery({
    queryKey: [...VUE_QUERY_CACHE_KEYS.widgetBalanceTrend, 'investment-calc-balance'],
    queryFn: () => getCombinedBalanceHistory(),
    staleTime: QUERY_CACHE_STALE_TIME.ANALYTICS,
  });

  const currentTotalBalance = computed(() => {
    const history = balanceHistory.value;
    if (!history || history.length === 0) return 0;
    return history[history.length - 1]!.totalBalance;
  });

  // Compute the cash flow query params based on selected period
  const cashFlowParams = computed(() => {
    const now = new Date();
    const to = endOfMonth(now);

    if (selectedPeriod.value === 'all') {
      // Use a very early start date to capture all history
      return {
        from: new Date(2000, 0, 1),
        to,
        granularity: 'monthly' as endpointsTypes.CashFlowGranularity,
      };
    }

    const months = PERIOD_MONTHS[selectedPeriod.value];
    const from = startOfMonth(subMonths(now, months - 1));

    return {
      from,
      to,
      granularity: 'monthly' as endpointsTypes.CashFlowGranularity,
    };
  });

  const { data: cashFlowData } = useQuery({
    queryKey: [...VUE_QUERY_CACHE_KEYS.analyticsCashFlow, 'investment-calc-net-income', selectedPeriod],
    queryFn: () => getCashFlow(cashFlowParams.value),
    staleTime: QUERY_CACHE_STALE_TIME.ANALYTICS,
  });

  const averageNetIncome = computed(() => {
    if (!cashFlowData.value) return 0;

    const { totals, periods } = cashFlowData.value;
    const numberOfMonths = periods.length;

    if (numberOfMonths === 0) return 0;

    const netIncome = totals.netFlow / numberOfMonths;
    // Don't return negative values — default to 0
    return Math.max(0, Math.round(netIncome * 100) / 100);
  });

  return {
    currentTotalBalance,
    averageNetIncome,
  };
}
