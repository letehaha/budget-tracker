<template>
  <div class="space-y-6">
    <!-- Header Row: Period Selector + Metric Toggle -->
    <div class="flex flex-wrap items-center gap-4">
      <PeriodSelector v-model="selectedPeriod" class="max-xs:mx-auto" />
      <MetricToggle v-model="selectedMetric" />
    </div>

    <!-- Error state -->
    <div v-if="cumulativeError" class="flex h-80 items-center justify-center">
      <div class="text-destructive-text">{{ t('analytics.trends.loadError') }}</div>
    </div>

    <!-- Content (with skeleton fallback) -->
    <template v-else>
      <!-- Summary Cards -->
      <div class="grid grid-cols-2 gap-4 md:grid-cols-3">
        <!-- Card 1: Current period -->
        <SummaryCardSkeleton v-if="isLoadingCumulative" title-width="w-20" value-width="w-28" />
        <SummaryCard
          v-else-if="cumulativeData"
          :title="metricLabel"
          :value="cumulativeData.currentPeriod.total"
          :change="cumulativeData.percentChange"
          :comparison-period-label="t('analytics.trends.vsPreviousPeriod')"
          :invert-colors="selectedMetric === 'expenses'"
        />

        <!-- Card 2: Previous period -->
        <SummaryCardSkeleton v-if="isLoadingCumulative" title-width="w-24" value-width="w-28" />
        <SummaryCard
          v-else-if="cumulativeData"
          :title="`${t('analytics.trends.chart.comparisonPeriod')}`"
          :value="cumulativeData.previousPeriod.total"
        />

        <!-- Card 3: Percent change -->
        <SummaryCardSkeleton
          v-if="isLoadingCumulative"
          container-class="col-span-2 flex items-center justify-center md:col-span-1"
          inner-class="text-center"
          title-width="w-24 mx-auto"
          value-width="w-16 mx-auto"
        />
        <div
          v-else-if="cumulativeData"
          class="border-border bg-card col-span-2 flex items-center justify-center rounded-lg border p-4 md:col-span-1"
        >
          <div class="text-center">
            <div class="text-muted-foreground mb-1 text-sm">{{ t('analytics.trends.vsPreviousPeriod') }}</div>
            <div
              :class="[
                'text-2xl font-semibold',
                cumulativeData.percentChange > 0
                  ? selectedMetric === 'expenses'
                    ? 'text-red-500'
                    : 'text-green-500'
                  : cumulativeData.percentChange < 0
                    ? selectedMetric === 'expenses'
                      ? 'text-green-500'
                      : 'text-red-500'
                    : 'text-muted-foreground',
              ]"
            >
              {{ cumulativeData.percentChange > 0 ? '+' : '' }}{{ cumulativeData.percentChange }}%
            </div>
          </div>
        </div>
      </div>

      <!-- Monthly Comparison Chart -->
      <MonthlyComparisonChart :from="selectedPeriod.from" :to="selectedPeriod.to" :metric="selectedMetric" />

      <!-- Cumulative Chart Skeleton -->
      <ChartSkeleton v-if="isLoadingCumulative" />

      <!-- Cumulative Chart -->
      <template v-else-if="cumulativeData">
        <div
          v-if="cumulativeData.currentPeriod.data.length > 0 || cumulativeData.previousPeriod.data.length > 0"
          class="border-border bg-card rounded-lg border p-4 max-sm:px-0"
        >
          <CumulativeChart
            :current-period-data="cumulativeData.currentPeriod.data"
            :previous-period-data="cumulativeData.previousPeriod.data"
            :metric="selectedMetric"
          />
        </div>

        <!-- Empty state for chart -->
        <div v-else class="border-border bg-card flex h-80 items-center justify-center rounded-lg border p-4">
          <div class="text-center">
            <div class="text-muted-foreground">{{ t('analytics.trends.noData') }}</div>
            <div class="text-muted-foreground mt-1 text-sm">{{ t('analytics.trends.noDataHint') }}</div>
          </div>
        </div>
      </template>
    </template>

    <!-- Category Breakdown (show for expenses and income, not savings) -->
    <CategoryBreakdown
      v-if="selectedMetric !== 'savings'"
      :current-period-data="currentPeriodCategories || {}"
      :previous-period-data="previousPeriodCategories || {}"
      :is-loading="isLoadingCategories"
      :is-income="selectedMetric === 'income'"
    />
  </div>
</template>

<script setup lang="ts">
import { getCumulativeData, getSpendingsByCategories } from '@/api';
import { QUERY_CACHE_STALE_TIME, VUE_QUERY_CACHE_KEYS } from '@/common/const';
import { TRANSACTION_TYPES } from '@bt/shared/types';
import { useQuery } from '@tanstack/vue-query';
import { useSessionStorage } from '@vueuse/core';
import { differenceInMonths, startOfMonth, subMonths } from 'date-fns';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

import { createPeriodSerializer } from '../../utils';
import ChartSkeleton from '../cash-flow/components/chart-skeleton.vue';
import PeriodSelector, { type Period } from '../cash-flow/components/period-selector.vue';
import SummaryCardSkeleton from '../cash-flow/components/summary-card-skeleton.vue';
import SummaryCard from '../cash-flow/components/summary-card.vue';
import CategoryBreakdown from './components/category-breakdown.vue';
import CumulativeChart from './components/cumulative-chart.vue';
import MetricToggle, { type MetricType } from './components/metric-toggle.vue';
import MonthlyComparisonChart from './components/monthly-comparison-chart.vue';

const { t } = useI18n();

// Helper to get default period
const getDefaultPeriod = (): Period => ({
  from: subMonths(new Date(), 12),
  to: new Date(),
});

const periodSerializer = createPeriodSerializer({ getDefaultPeriod });

// State with session persistence using VueUse
const selectedPeriod = useSessionStorage<Period>('trends-comparison-period', getDefaultPeriod(), {
  serializer: periodSerializer,
});
const selectedMetric = useSessionStorage<MetricType>('trends-comparison-metric', 'expenses');

// Computed metric label
const metricLabel = computed(() => {
  const labels = {
    expenses: t('analytics.trends.metrics.expenses'),
    income: t('analytics.trends.metrics.income'),
    savings: t('analytics.trends.metrics.savings'),
  };
  return labels[selectedMetric.value];
});

// Query params
const cumulativeQueryParams = computed(() => ({
  from: selectedPeriod.value.from,
  to: selectedPeriod.value.to,
  metric: selectedMetric.value,
}));

// Cumulative data query
const {
  data: cumulativeData,
  isLoading: isLoadingCumulative,
  error: cumulativeError,
} = useQuery({
  queryKey: [...VUE_QUERY_CACHE_KEYS.analyticsCumulative, cumulativeQueryParams],
  queryFn: () => getCumulativeData(cumulativeQueryParams.value),
  staleTime: QUERY_CACHE_STALE_TIME.ANALYTICS,
  gcTime: QUERY_CACHE_STALE_TIME.ANALYTICS * 2,
});

// Category breakdown queries (for expenses and income, not savings)
const categoryType = computed(() =>
  selectedMetric.value === TRANSACTION_TYPES.income ? TRANSACTION_TYPES.income : TRANSACTION_TYPES.expense,
);

const currentPeriodDates = computed(() => ({
  from: selectedPeriod.value.from,
  to: selectedPeriod.value.to,
  type: categoryType.value,
}));

// Calculate period length and get the immediately preceding period (same as cumulative chart)
const periodLengthMonths = computed(
  () => differenceInMonths(startOfMonth(selectedPeriod.value.to), startOfMonth(selectedPeriod.value.from)) + 1,
);

const previousPeriodDates = computed(() => ({
  from: subMonths(selectedPeriod.value.from, periodLengthMonths.value),
  to: subMonths(selectedPeriod.value.to, periodLengthMonths.value),
  type: categoryType.value,
}));

const { data: currentPeriodCategories, isLoading: isLoadingCurrentCategories } = useQuery({
  queryKey: [...VUE_QUERY_CACHE_KEYS.analyticsSpendingsByCategories, 'current', cumulativeQueryParams],
  queryFn: () => getSpendingsByCategories(currentPeriodDates.value),
  staleTime: QUERY_CACHE_STALE_TIME.ANALYTICS,
  gcTime: QUERY_CACHE_STALE_TIME.ANALYTICS * 2,
  enabled: computed(() => selectedMetric.value !== 'savings'),
});

const { data: previousPeriodCategories, isLoading: isLoadingPreviousCategories } = useQuery({
  queryKey: [...VUE_QUERY_CACHE_KEYS.analyticsSpendingsByCategories, 'previous', cumulativeQueryParams],
  queryFn: () => getSpendingsByCategories(previousPeriodDates.value),
  staleTime: QUERY_CACHE_STALE_TIME.ANALYTICS,
  gcTime: QUERY_CACHE_STALE_TIME.ANALYTICS * 2,
  enabled: computed(() => selectedMetric.value !== 'savings'),
});

const isLoadingCategories = computed(() => isLoadingCurrentCategories.value || isLoadingPreviousCategories.value);
</script>
