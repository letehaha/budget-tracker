<script lang="ts" setup>
import { getCashFlow } from '@/api/stats';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import { useFormatCurrency } from '@/composable/formatters';
import { useAnimatedNumber } from '@/composable/use-animated-number';
import { calculatePercentageDifference } from '@/js/helpers/math/calculate-percentage-difference';
import { useRootStore } from '@/stores';
import { useQuery } from '@tanstack/vue-query';
import ResponsiveTooltip from '@/components/common/responsive-tooltip.vue';
import {
  differenceInDays,
  endOfMonth,
  format,
  isSameMonth,
  parseISO,
  startOfMonth,
  subDays,
  subMonths,
} from 'date-fns';
import { ArrowDownRightIcon, ArrowUpRightIcon, InfoIcon, WalletIcon } from 'lucide-vue-next';
import { storeToRefs } from 'pinia';
import { computed } from 'vue';

import EmptyState from './components/empty-state.vue';
import LoadingState from './components/loading-state.vue';
import WidgetWrapper from './components/widget-wrapper.vue';

defineOptions({ name: 'cash-flow-widget' });

const props = defineProps<{
  selectedPeriod: { from: Date; to: Date };
}>();

const { isAppInitialized } = storeToRefs(useRootStore());
const { formatBaseCurrency } = useFormatCurrency();

const periodQueryKey = computed(
  () => `${props.selectedPeriod.from.toISOString()}-${props.selectedPeriod.to.toISOString()}`,
);

const { data: currentData, isFetching: isCurrentFetching } = useQuery({
  queryKey: computed(() => [...VUE_QUERY_CACHE_KEYS.widgetCashFlow, periodQueryKey.value]),
  queryFn: () =>
    getCashFlow({
      from: props.selectedPeriod.from,
      to: props.selectedPeriod.to,
      granularity: 'monthly',
    }),
  staleTime: Infinity,
  placeholderData: (prev) => prev,
  enabled: isAppInitialized,
});

const isFullMonth = computed(() => {
  const { from, to } = props.selectedPeriod;
  return isSameMonth(from, to) && from.getDate() === 1 && to.getDate() === endOfMonth(to).getDate();
});

const prevPeriod = computed(() => {
  const { from, to } = props.selectedPeriod;

  if (isFullMonth.value) {
    const prev = subMonths(from, 1);
    return { from: startOfMonth(prev), to: endOfMonth(prev) };
  }

  const durationInDays = differenceInDays(to, from) + 1;
  return { from: subDays(from, durationInDays), to: subDays(from, 1) };
});

const { data: prevData, isFetching: isPrevFetching } = useQuery({
  queryKey: computed(() => [...VUE_QUERY_CACHE_KEYS.widgetCashFlowPrev, periodQueryKey.value]),
  queryFn: () =>
    getCashFlow({
      from: prevPeriod.value.from,
      to: prevPeriod.value.to,
      granularity: 'monthly',
    }),
  staleTime: Infinity,
  placeholderData: (prev) => prev,
  enabled: isAppInitialized,
});

const isFetching = computed(() => isCurrentFetching.value || isPrevFetching.value);
const isInitialLoading = computed(() => isFetching.value && !currentData.value);
const isEmpty = computed(
  () => currentData.value && currentData.value.totals.income === 0 && currentData.value.totals.expenses === 0,
);

const income = computed(() => currentData.value?.totals.income ?? 0);
const expenses = computed(() => currentData.value?.totals.expenses ?? 0);
const netFlow = computed(() => currentData.value?.totals.netFlow ?? 0);
const savingsRate = computed(() => currentData.value?.totals.savingsRate ?? 0);

const { displayValue: animatedIncome } = useAnimatedNumber({ value: income });
const { displayValue: animatedExpenses } = useAnimatedNumber({ value: expenses });
const { displayValue: animatedNetFlow } = useAnimatedNumber({ value: netFlow });

// Flow bar proportions
const flowBarTotal = computed(() => income.value + expenses.value);

const incomePercent = computed(() => {
  if (flowBarTotal.value === 0) return 50;
  return Math.max(5, (income.value / flowBarTotal.value) * 100);
});

const expensePercent = computed(() => {
  if (flowBarTotal.value === 0) return 50;
  return Math.max(5, (expenses.value / flowBarTotal.value) * 100);
});

// Percentage change vs previous period
const netFlowDiff = computed(() => {
  const prevNet = prevData.value?.totals.netFlow ?? 0;
  return Number(calculatePercentageDifference(netFlow.value, prevNet).toFixed(1));
});

const periodLabel = computed(() => {
  const { from, to } = props.selectedPeriod;
  if (isSameMonth(from, to)) {
    return format(from, 'MMMM yyyy');
  }
  return `${format(from, 'MMM d')} - ${format(to, 'MMM d, yyyy')}`;
});

const isPositiveFlow = computed(() => netFlow.value >= 0);

// Trend: previous 5 periods + current period
const PREV_PERIOD_COUNT = 5;

const trendPeriods = computed(() => {
  const { from, to } = props.selectedPeriod;
  const durationInDays = differenceInDays(to, from) + 1;

  const periods: { from: Date; to: Date; isCurrent: boolean }[] = [];

  for (let i = PREV_PERIOD_COUNT; i >= 1; i--) {
    if (isFullMonth.value) {
      const periodFrom = startOfMonth(subMonths(from, i));
      periods.push({ from: periodFrom, to: endOfMonth(periodFrom), isCurrent: false });
    } else {
      const periodTo = subDays(from, (i - 1) * durationInDays + 1);
      const periodFrom = subDays(periodTo, durationInDays - 1);
      periods.push({ from: periodFrom, to: periodTo, isCurrent: false });
    }
  }

  // Add current period as the last bar
  periods.push({ from, to, isCurrent: true });

  return periods;
});

const trendRange = computed(() => {
  const pastPeriods = trendPeriods.value.filter((p) => !p.isCurrent);
  return { from: pastPeriods[0]!.from, to: pastPeriods[pastPeriods.length - 1]!.to };
});

const { data: trendData } = useQuery({
  queryKey: computed(() => [...VUE_QUERY_CACHE_KEYS.widgetCashFlowTrend, periodQueryKey.value]),
  queryFn: () =>
    getCashFlow({
      from: trendRange.value.from,
      to: trendRange.value.to,
      granularity: 'monthly',
    }),
  staleTime: Infinity,
  placeholderData: (prev) => prev,
  enabled: isAppInitialized,
});

const trendBars = computed(() => {
  const buckets = trendPeriods.value;
  // Need trend data for past periods; current period uses currentData
  if (!trendData.value?.periods.length && !currentData.value) return [];

  const apiPeriods = trendData.value?.periods ?? [];

  const aggregated = buckets.map((bucket) => {
    let bucketNetFlow: number;

    if (bucket.isCurrent) {
      // Use the main widget data for the current period
      bucketNetFlow = currentData.value?.totals.netFlow ?? 0;
    } else {
      bucketNetFlow = 0;
      for (const ap of apiPeriods) {
        const apStart = parseISO(ap.periodStart);
        if (apStart >= bucket.from && apStart <= bucket.to) {
          bucketNetFlow += ap.netFlow;
        }
      }
    }

    return { ...bucket, netFlow: bucketNetFlow };
  });

  const maxAbs = Math.max(...aggregated.map((p) => Math.abs(p.netFlow)), 1);

  return aggregated.map((p) => {
    const isSingleMonth = isSameMonth(p.from, p.to);
    const label = isSingleMonth ? format(p.from, 'MMM') : `${format(p.from, 'MMM d')} - ${format(p.to, 'MMM d')}`;
    const shortLabel = isSingleMonth ? format(p.from, 'MMM') : format(p.from, 'MMM yy');

    return {
      label,
      shortLabel,
      value: p.netFlow,
      heightPercent: (Math.abs(p.netFlow) / maxAbs) * 100,
      isPositive: p.netFlow >= 0,
      isCurrent: p.isCurrent,
      formatted: formatBaseCurrency(p.netFlow),
    };
  });
});
</script>

<template>
  <WidgetWrapper :is-fetching="isFetching">
    <template #title>
      <span class="inline-flex items-center gap-1">
        {{ $t('dashboard.widgets.cashFlow.title') }}

        <ResponsiveTooltip
          :content="$t('dashboard.widgets.cashFlow.description')"
          content-class-name="max-w-56"
          :delay-duration="100"
        >
          <InfoIcon class="text-muted-foreground ml-1 size-4 cursor-help" />
        </ResponsiveTooltip>
      </span>
    </template>

    <template v-if="isInitialLoading">
      <LoadingState />
    </template>

    <template v-else-if="isEmpty && !isFetching">
      <EmptyState>
        <WalletIcon class="size-32" />
      </EmptyState>
    </template>

    <template v-else>
      <div class="flex h-full flex-col gap-3">
        <!-- Header: net flow amount + period -->
        <div class="mb-4">
          <div class="flex items-start justify-between gap-2">
            <div>
              <p
                class="text-2xl font-bold tracking-tight"
                :class="isPositiveFlow ? 'text-app-income-color' : 'text-app-expense-color'"
              >
                {{ isPositiveFlow ? '+' : '' }}{{ formatBaseCurrency(animatedNetFlow) }}
              </p>
              <p class="text-muted-foreground mt-0.5 text-xs font-medium tracking-tight uppercase">
                {{ periodLabel }}
              </p>
            </div>

            <!-- Comparison badge -->
            <div v-if="prevData" class="flex flex-col items-end gap-0.5">
              <span
                class="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold"
                :class="{
                  'bg-success-text/15 text-success-text': netFlowDiff > 0,
                  'bg-destructive-text/15 text-destructive-text': netFlowDiff < 0,
                  'bg-muted text-muted-foreground': netFlowDiff === 0,
                }"
              >
                <ArrowUpRightIcon v-if="netFlowDiff > 0" class="size-3" />
                <ArrowDownRightIcon v-else-if="netFlowDiff < 0" class="size-3" />
                {{ netFlowDiff > 0 ? '+' : '' }}{{ netFlowDiff }}%
              </span>
              <span class="text-muted-foreground text-[10px]">
                {{ $t('dashboard.widgets.cashFlow.vsPrevious') }}
              </span>
            </div>
          </div>
        </div>

        <!-- Flow bar visualization -->
        <div>
          <div class="flex h-3 w-full overflow-hidden rounded-full">
            <div
              class="bg-app-income-color transition-all duration-500 ease-out"
              :style="{ width: `${incomePercent}%` }"
            />
            <div class="bg-muted w-px shrink-0" />
            <div
              class="bg-app-expense-color transition-all duration-500 ease-out"
              :style="{ width: `${expensePercent}%` }"
            />
          </div>
        </div>

        <!-- Stats grid -->
        <div class="grid grid-cols-3 gap-3">
          <!-- Income -->
          <div class="rounded-lg border p-3">
            <div class="text-muted-foreground mb-1 text-[11px] font-medium tracking-wider uppercase">
              {{ $t('dashboard.widgets.cashFlow.income') }}
            </div>
            <div class="text-app-income-color text-amount text-sm">
              {{ formatBaseCurrency(animatedIncome) }}
            </div>
          </div>

          <!-- Expenses -->
          <div class="rounded-lg border p-3">
            <div class="text-muted-foreground mb-1 text-[11px] font-medium tracking-wider uppercase">
              {{ $t('dashboard.widgets.cashFlow.expenses') }}
            </div>
            <div class="text-app-expense-color text-amount text-sm">
              {{ formatBaseCurrency(animatedExpenses) }}
            </div>
          </div>

          <!-- Savings rate -->
          <div class="rounded-lg border p-3">
            <div class="text-muted-foreground mb-1 text-[11px] font-medium tracking-wider uppercase">
              {{ $t('dashboard.widgets.cashFlow.saved') }}
            </div>
            <div
              class="text-amount text-sm"
              :class="savingsRate >= 0 ? 'text-app-income-color' : 'text-app-expense-color'"
            >
              {{ savingsRate }}%
            </div>
          </div>
        </div>

        <!-- Trend mini bars -->
        <div v-if="trendBars.length" class="mt-auto flex flex-col gap-1.5">
          <div class="text-muted-foreground text-[11px] font-medium tracking-wider uppercase">
            {{ $t('dashboard.widgets.cashFlow.previousPeriodsTrend') }}
          </div>
          <div class="flex h-25 items-end gap-2.5">
            <ResponsiveTooltip v-for="(bar, index) in trendBars" :key="index" :delay-duration="100">
              <div class="flex flex-1 flex-col items-center gap-1">
                <div class="flex h-22 w-full max-w-10 items-end justify-center">
                  <div
                    class="min-h-1 w-full rounded-xs transition-all duration-500"
                    :class="bar.isPositive ? 'bg-app-income-color/90' : 'bg-app-expense-color/90'"
                    :style="{ height: `${Math.max(bar.heightPercent, 4)}%` }"
                  />
                </div>
                <span class="text-muted-foreground text-[9px] leading-none">{{ bar.shortLabel }}</span>
              </div>
              <template #content>
                <span>{{ bar.label }}: </span>
                <span
                  class="font-semibold"
                  :class="bar.isPositive ? 'text-app-income-color' : 'text-app-expense-color'"
                >
                  {{ bar.formatted }}
                </span>
              </template>
            </ResponsiveTooltip>
          </div>
        </div>
      </div>
    </template>
  </WidgetWrapper>
</template>
