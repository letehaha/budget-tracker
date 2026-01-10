<template>
  <div class="space-y-6">
    <!-- Header Row: Period Selector + Options -->
    <div class="flex gap-4 max-md:flex-col md:justify-between">
      <!-- Period selector - centered on mobile, left on desktop -->
      <div class="flex justify-center lg:justify-start">
        <PeriodSelector v-model="selectedPeriod" />
      </div>

      <!-- Controls row - wraps nicely on mobile -->
      <div class="flex flex-wrap items-center justify-center gap-2 max-sm:justify-between sm:gap-3 lg:justify-start">
        <GranularitySelector v-model="selectedGranularity" />
        <ChartTypeSwitcher v-model="selectedChartType" />

        <!-- Settings dropdown -->
        <Popover>
          <PopoverTrigger as-child>
            <UiButton variant="secondary" size="icon" :title="t('common.actions.settings')">
              <Settings2Icon class="size-4" />
            </UiButton>
          </PopoverTrigger>
          <PopoverContent align="end" class="w-auto max-w-70">
            <div class="space-y-3">
              <div class="space-y-1">
                <div class="flex items-center gap-2">
                  <Checkbox id="show-trend-line" v-model="showMovingAverage" />
                  <Label for="show-trend-line" class="cursor-pointer text-sm font-normal">
                    {{ t('analytics.cashFlow.showTrendLine') }}
                  </Label>
                </div>
                <p class="text-muted-foreground pl-6 text-xs">
                  {{ t('analytics.cashFlow.showTrendLineHint') }}
                </p>
              </div>
              <div class="space-y-1">
                <div class="flex items-center gap-2">
                  <Checkbox id="exclude-categories" v-model="excludeCategories" />
                  <Label for="exclude-categories" class="cursor-pointer text-sm font-normal">
                    {{ t('analytics.cashFlow.excludeCategories') }}
                  </Label>
                </div>
                <p class="text-muted-foreground pl-6 text-xs">
                  {{ t('analytics.cashFlow.excludeCategoriesHint') }}
                </p>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>

    <!-- Summary Cards -->
    <div v-if="cashFlowData" class="grid grid-cols-2 gap-4 md:grid-cols-4">
      <SummaryCard
        :title="t('analytics.cashFlow.income')"
        :value="cashFlowData.totals.income"
        :change="trends.income"
        :comparison-period-label="comparisonPeriodLabel"
      />
      <SummaryCard
        :title="t('analytics.cashFlow.expenses')"
        :value="cashFlowData.totals.expenses"
        :change="trends.expenses"
        :comparison-period-label="comparisonPeriodLabel"
      />
      <SummaryCard
        :title="t('analytics.cashFlow.netSavings')"
        :value="cashFlowData.totals.netFlow"
        :change="trends.netFlow"
        :comparison-period-label="comparisonPeriodLabel"
      />
      <SummaryCard
        :title="t('analytics.cashFlow.savingsRate')"
        :value="Math.round(cashFlowData.totals.savingsRate)"
        suffix="%"
        :change="trends.savingsRate"
        :comparison-period-label="comparisonPeriodLabel"
      />
    </div>

    <!-- Loading state -->
    <div v-if="isLoading" class="flex h-100 items-center justify-center">
      <div class="text-muted-foreground">{{ t('common.actions.loading') }}</div>
    </div>

    <!-- Error state -->
    <div v-else-if="error" class="flex h-100 items-center justify-center">
      <div class="text-destructive-text">{{ t('analytics.cashFlow.loadError') }}</div>
    </div>

    <!-- Chart -->
    <div
      v-else-if="cashFlowData && cashFlowData.periods.length > 0"
      class="border-border bg-card rounded-lg border p-4 max-sm:px-0"
    >
      <CashFlowChart
        :data="cashFlowData.periods"
        :chart-type="selectedChartType"
        :show-moving-average="showMovingAverage"
      />
    </div>

    <!-- Empty state -->
    <div v-else-if="cashFlowData && cashFlowData.periods.length === 0" class="flex h-100 items-center justify-center">
      <div class="text-center">
        <div class="text-muted-foreground">{{ t('analytics.cashFlow.noData') }}</div>
        <div class="text-muted-foreground mt-1 text-sm">{{ t('analytics.cashFlow.noDataHint') }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { getCashFlow } from '@/api';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import UiButton from '@/components/lib/ui/button/Button.vue';
import Checkbox from '@/components/lib/ui/checkbox/Checkbox.vue';
import Label from '@/components/lib/ui/label/Label.vue';
import Popover from '@/components/lib/ui/popover/Popover.vue';
import PopoverContent from '@/components/lib/ui/popover/PopoverContent.vue';
import PopoverTrigger from '@/components/lib/ui/popover/PopoverTrigger.vue';
import { useDateLocale } from '@/composable/use-date-locale';
import type { endpointsTypes } from '@bt/shared/types';
import { useQuery } from '@tanstack/vue-query';
import { differenceInDays, endOfMonth, startOfMonth, subDays, subMonths } from 'date-fns';
import { Settings2Icon } from 'lucide-vue-next';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

import CashFlowChart from './components/cash-flow-chart.vue';
import ChartTypeSwitcher, { type ChartType } from './components/chart-type-switcher.vue';
import GranularitySelector from './components/granularity-selector.vue';
import type { Period } from './components/period-selector.vue';
import PeriodSelector from './components/period-selector.vue';
import SummaryCard from './components/summary-card.vue';

const { t } = useI18n();
const { format } = useDateLocale();

// Constants
const DEFAULT_PERIOD_MONTHS = 12;

// State
const selectedPeriod = ref<Period>({
  from: startOfMonth(subMonths(new Date(), DEFAULT_PERIOD_MONTHS - 1)),
  to: endOfMonth(new Date()),
});

const selectedGranularity = ref<endpointsTypes.CashFlowGranularity>('monthly');
const selectedChartType = ref<ChartType>('mirrored');
const excludeCategories = ref(false);
const showMovingAverage = ref(true);

// Calculate previous period (same duration, immediately before current period)
const previousPeriod = computed(() => {
  const periodDays = differenceInDays(selectedPeriod.value.to, selectedPeriod.value.from) + 1;
  return {
    from: subDays(selectedPeriod.value.from, periodDays),
    to: subDays(selectedPeriod.value.from, 1),
  };
});

// Format the comparison period label for tooltips
const comparisonPeriodLabel = computed(() => {
  const from = previousPeriod.value.from;
  const to = previousPeriod.value.to;

  // Format: "vs 1 Feb 2024 – 31 Jan 2025 (prev period)"
  const fromStr = format(from, 'd MMM yyyy');
  const toStr = format(to, 'd MMM yyyy');

  return `vs ${fromStr} – ${toStr}`;
});

// Query params for current period
const queryParams = computed(() => ({
  from: selectedPeriod.value.from,
  to: selectedPeriod.value.to,
  granularity: selectedGranularity.value,
  excludeCategories: excludeCategories.value,
}));

// Query params for previous period (for trend comparison)
const previousQueryParams = computed(() => ({
  from: previousPeriod.value.from,
  to: previousPeriod.value.to,
  granularity: selectedGranularity.value,
  excludeCategories: excludeCategories.value,
}));

// Cache for 5 minutes since financial data doesn't change frequently
const FIVE_MINUTES = 5 * 60 * 1000;

const {
  data: cashFlowData,
  isLoading,
  error,
} = useQuery({
  queryKey: [...VUE_QUERY_CACHE_KEYS.analyticsCashFlow, queryParams],
  queryFn: () => getCashFlow(queryParams.value),
  staleTime: FIVE_MINUTES,
  gcTime: FIVE_MINUTES * 2,
});

// Fetch previous period data for trend comparison
const { data: previousCashFlowData } = useQuery({
  queryKey: [...VUE_QUERY_CACHE_KEYS.analyticsCashFlow, previousQueryParams],
  queryFn: () => getCashFlow(previousQueryParams.value),
  staleTime: FIVE_MINUTES,
  gcTime: FIVE_MINUTES * 2,
});

// Calculate trend (% change between current period totals and previous period totals)
const calculateTrend = ({
  current,
  previous,
}: {
  current: number | undefined;
  previous: number | undefined;
}): number | undefined => {
  if (current === undefined || previous === undefined) return undefined;
  if (previous === 0) return current > 0 ? 100 : current < 0 ? -100 : 0;
  return Math.round(((current - previous) / Math.abs(previous)) * 100);
};

const trends = computed(() => {
  const currentTotals = cashFlowData.value?.totals;
  const previousTotals = previousCashFlowData.value?.totals;

  return {
    income: calculateTrend({
      current: currentTotals?.income,
      previous: previousTotals?.income,
    }),
    expenses: calculateTrend({
      current: currentTotals?.expenses ? Math.abs(currentTotals.expenses) : undefined,
      previous: previousTotals?.expenses ? Math.abs(previousTotals.expenses) : undefined,
    }),
    netFlow: calculateTrend({
      current: currentTotals?.netFlow,
      previous: previousTotals?.netFlow,
    }),
    // Savings rate comparison: difference in percentage points (not % change)
    savingsRate:
      currentTotals?.savingsRate !== undefined && previousTotals?.savingsRate !== undefined
        ? Math.round(currentTotals.savingsRate - previousTotals.savingsRate)
        : undefined,
  };
});
</script>
