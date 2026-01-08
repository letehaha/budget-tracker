<template>
  <WidgetWrapper :is-fetching="isWidgetDataFetching" class="min-h-[320px]">
    <template #title>
      <div class="flex w-full items-center gap-4">
        <span>{{ $t('dashboard.widgets.balanceTrend.title') }}</span>
        <SelectField
          v-model="selectedBalanceType"
          :values="balanceTypeOptions"
          value-key="value"
          label-key="label"
          class="w-[140px] text-xs"
          :disabled="isWidgetDataFetching"
        />
      </div>
    </template>
    <template v-if="isInitialLoading">
      <LoadingState />
    </template>
    <template v-else-if="isDataEmpty">
      <EmptyState>
        <ChartLineIcon class="size-32" />
      </EmptyState>
    </template>
    <template v-else>
      <div>
        <div class="mb-1 flex items-center justify-between text-xs">
          <div class="font-medium tracking-tight uppercase">{{ periodLabel }}</div>
          <div class="tracking-tight">{{ $t('dashboard.widgets.balanceTrend.vsPreviousPeriod') }}</div>
        </div>

        <div class="flex items-center justify-between">
          <div class="text-lg font-bold tracking-wider">
            {{ formatBaseCurrency(displayBalance.current) }}
          </div>
          <div
            :class="{
              'text-app-expense-color': balancesDiff < 0,
              'text-success-text': balancesDiff > 0,
            }"
          >
            {{ `${balancesDiff}%` }}
          </div>
        </div>
      </div>

      <Transition name="chart-fade" mode="out-in">
        <highcharts :key="chartKey" v-node-resize-observer="{ callback: onChartResize }" :options="chartOptions" />
      </Transition>
    </template>
  </WidgetWrapper>
</template>

<script lang="ts" setup>
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import SelectField from '@/components/fields/select-field.vue';
import { useFormatCurrency, useHighcharts } from '@/composable';
import { calculatePercentageDifference, formatLargeNumber } from '@/js/helpers';
import { loadCombinedBalanceTrendData } from '@/services';
import { useCurrenciesStore } from '@/stores';
import { useQuery } from '@tanstack/vue-query';
import { differenceInDays, format, isSameMonth, min, startOfDay, subDays } from 'date-fns';
import { Chart as Highcharts } from 'highcharts-vue';
import { ChartLineIcon } from 'lucide-vue-next';
import { storeToRefs } from 'pinia';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

import EmptyState from './components/empty-state.vue';
import LoadingState from './components/loading-state.vue';
import WidgetWrapper from './components/widget-wrapper.vue';

// Calculate it manually so chart will always have first and last ticks (dates)
function generateDateSteps(datesToShow = 5, fromDate: Date, toDate: Date) {
  const start = startOfDay(fromDate).getTime();
  const end = startOfDay(toDate).getTime();
  const duration = end - start;
  const dates = [start];

  for (let i = 1; i < datesToShow - 1; i++) {
    const nextDate = start + (duration * i) / (datesToShow - 1);
    dates.push(Math.floor(nextDate));
  }

  dates.push(end);

  return dates;
}

defineOptions({
  name: 'balance-trend-widget',
});

const props = defineProps<{
  selectedPeriod: { from: Date; to: Date };
}>();

const { t } = useI18n();

const balanceTypeOptions = computed(() => [
  { value: 'total' as const, label: t('dashboard.widgets.balanceTrend.balanceTypes.total') },
  { value: 'accounts' as const, label: t('dashboard.widgets.balanceTrend.balanceTypes.accounts') },
  { value: 'portfolios' as const, label: t('dashboard.widgets.balanceTrend.balanceTypes.portfolios') },
]);
const currentChartWidth = ref(0);
const selectedBalanceType = ref(balanceTypeOptions.value[0]);
const { formatBaseCurrency } = useFormatCurrency();
const { baseCurrency } = storeToRefs(useCurrenciesStore());
const { buildAreaChartConfig } = useHighcharts();

// We store actual and prev period separately, so when new data is loading, we
// can still show the old period, to avoid UI flickering
const actualDataPeriod = ref(props.selectedPeriod);
const prevDataPeriod = ref(props.selectedPeriod);
// Include both from and to in query key to ensure cache invalidation when period changes
const periodQueryKey = computed(() => `${props.selectedPeriod.from.getTime()}-${props.selectedPeriod.to.getTime()}`);

// For data fetching, cap the 'to' date at today - we can't have balance history
// for future dates. The chart x-axis will still show the full period range.
const fetchPeriod = computed(() => ({
  from: props.selectedPeriod.from,
  to: min([props.selectedPeriod.to, new Date()]),
}));

const { data: balanceHistory, isFetching: isBalanceHistoryFetching } = useQuery({
  queryKey: [...VUE_QUERY_CACHE_KEYS.widgetBalanceTrend, periodQueryKey],
  queryFn: () => loadCombinedBalanceTrendData(fetchPeriod.value),
  staleTime: Infinity,
  placeholderData: (prevData) => prevData,
});

// Fetch the previous period's balance to compare against
// The previous period has the same duration and ends right before the current period starts
const prevPeriod = computed(() => {
  const durationInDays = differenceInDays(props.selectedPeriod.to, props.selectedPeriod.from) + 1;
  const prevTo = subDays(props.selectedPeriod.from, 1); // Day before current period starts
  const prevFrom = subDays(props.selectedPeriod.from, durationInDays);

  return {
    from: prevFrom,
    to: min([prevTo, new Date()]),
  };
});

const { data: prevPeriodBalance, isFetching: isPrevPeriodBalanceFetching } = useQuery({
  queryKey: [...VUE_QUERY_CACHE_KEYS.widgetBalanceTrendPrev, periodQueryKey],
  queryFn: () => loadCombinedBalanceTrendData(prevPeriod.value),
  staleTime: Infinity,
  placeholderData: (prevData) => prevData,
});

const isWidgetDataFetching = computed(() => isBalanceHistoryFetching.value || isPrevPeriodBalanceFetching.value);
// Only show full loading state on initial load (when we have no data to display)
const isInitialLoading = computed(() => isWidgetDataFetching.value && !balanceHistory.value);

// On each "selectedPeriod" change we immediately set it as "actualDataPeriod"
// but if "isWidgetDataFetching" is also triggered, means we started loading new
// data, then we need to actually reassing "actualDataPeriod" to be as "prevDataPeriod",
// so there won't be any data flickering. Once data is fully loaded, we assign
// actual values to both of them
watch(
  () => props.selectedPeriod,
  (value) => {
    actualDataPeriod.value = value;
  },
);
watch(
  isWidgetDataFetching,
  (value) => {
    if (value) {
      actualDataPeriod.value = prevDataPeriod.value;
    } else {
      actualDataPeriod.value = props.selectedPeriod;
      prevDataPeriod.value = props.selectedPeriod;
    }
  },
  { immediate: true },
);

const isDataEmpty = computed(() => !balanceHistory.value || balanceHistory.value.every((i) => i.totalBalance === 0));

// Key for the chart component - changes when period changes to trigger CSS transition
const chartKey = computed(() => `${actualDataPeriod.value.from.getTime()}-${actualDataPeriod.value.to.getTime()}`);

const periodLabel = computed(() => {
  const from = props.selectedPeriod.from;
  const to = props.selectedPeriod.to;
  const now = new Date();

  // Current month - show "Today"
  if (isSameMonth(now, to) && isSameMonth(from, to)) {
    return 'Today';
  }

  // Specific month (not current) - show "November 2025"
  if (isSameMonth(from, to)) {
    return format(to, 'MMMM yyyy');
  }

  // Check if it's a month-aligned range (starts on 1st day, ends on last day of month)
  const isFromMonthStart = from.getDate() === 1;
  const endOfToMonth = new Date(to.getFullYear(), to.getMonth() + 1, 0);
  const isToMonthEnd = to.getDate() === endOfToMonth.getDate();

  if (isFromMonthStart && isToMonthEnd) {
    // Multi-month range like "Aug 2025 - Nov 2025"
    return `${format(from, 'MMM yyyy')} - ${format(to, 'MMM yyyy')}`;
  }

  // Custom date range - show "MMM d, yyyy - MMM d, yyyy"
  return `${format(from, 'MMM d, yyyy')} - ${format(to, 'MMM d, yyyy')}`;
});

const chartOptions = computed(() => {
  const pixelsPerTick = 120;
  const ticksAmount = currentChartWidth.value ? Math.round(currentChartWidth.value / pixelsPerTick) : 5;

  const fromDate = actualDataPeriod.value.from;
  const toDate = actualDataPeriod.value.to;

  const xAxisTicks = generateDateSteps(ticksAmount, fromDate, toDate);

  const config = buildAreaChartConfig({
    chart: {
      height: 200,
      marginTop: 20,
      animation: false,
    },
    legend: {
      itemStyle: {
        color: 'rgba(255,255,255,.9)',
      },
    },
    plotOptions: {
      area: {
        animation: false,
      },
      series: {
        animation: false,
      },
    },
    tooltip: {
      formatter() {
        const date = new Date(this.x).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        });

        // Find the corresponding data point to get accounts and portfolios breakdown
        // Use startOfDay to match the data point timestamps (same as series data)
        const dataPoint = balanceHistory.value?.find((point) => startOfDay(new Date(point.date)).getTime() === this.x);

        if (!dataPoint) return '';

        let tooltipHtml = `<strong>${date}</strong><br/>`;

        tooltipHtml += `Accounts: ${formatLargeNumber(dataPoint.accountsBalance, {
          isFiat: true,
          currency: baseCurrency.value?.currency?.code,
        })}<br/>`;
        tooltipHtml += `Portfolios: ${formatLargeNumber(dataPoint.portfoliosBalance, {
          isFiat: true,
          currency: baseCurrency.value?.currency?.code,
        })}<br/>`;
        tooltipHtml += `<strong>Total: ${formatLargeNumber(dataPoint.totalBalance, {
          isFiat: true,
          currency: baseCurrency.value?.currency?.code,
        })}</strong>`;

        return `<div class="text-sm">${tooltipHtml}</div>`;
      },
    },
    xAxis: {
      tickPositions: xAxisTicks,
      labels: {
        formatter() {
          const date = new Date(this.value);
          return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
          });
        },
      },
      type: 'datetime',
      min: xAxisTicks[0],
      max: xAxisTicks[xAxisTicks.length - 1],
    },
    yAxis: {
      tickAmount: 5,
      labels: {
        formatter() {
          return formatLargeNumber(this.value, {
            isFiat: true,
            currency: baseCurrency.value?.currency?.code,
          });
        },
      },
    },
    series: [
      {
        type: 'area',
        showInLegend: false,
        fillOpacity: 0.6,
        data: (balanceHistory.value || []).map((point) => {
          const value =
            selectedBalanceType.value.value === 'total'
              ? point.totalBalance
              : selectedBalanceType.value.value === 'accounts'
                ? point.accountsBalance
                : point.portfoliosBalance;
          // Use startOfDay to match the x-axis tick calculation (local timezone)
          return [startOfDay(new Date(point.date)).getTime(), value];
        }),
      },
    ],
  });

  return config;
});

const displayBalance = computed(() => {
  if (!balanceHistory.value || balanceHistory.value.length === 0) return { current: 0, previous: 0 };

  // Get the latest balance entry from current period
  const latestEntry = balanceHistory.value[balanceHistory.value.length - 1];

  // Get the latest (ending) balance from previous period for comparison
  const prevPeriodLastEntry =
    prevPeriodBalance.value && prevPeriodBalance.value.length > 0
      ? prevPeriodBalance.value[prevPeriodBalance.value.length - 1]
      : null;

  switch (selectedBalanceType.value.value) {
    case 'accounts':
      return {
        current: latestEntry.accountsBalance || 0,
        previous: prevPeriodLastEntry?.accountsBalance || 0,
      };
    case 'portfolios':
      return {
        current: latestEntry.portfoliosBalance || 0,
        previous: prevPeriodLastEntry?.portfoliosBalance || 0,
      };
    case 'total':
    default:
      return {
        current: latestEntry.totalBalance || 0,
        previous: prevPeriodLastEntry?.totalBalance || 0,
      };
  }
});

const balancesDiff = computed<number>(() => {
  if (!displayBalance.value.current || !displayBalance.value.previous) return 0;

  const percentage = Number(
    calculatePercentageDifference(displayBalance.value.current, displayBalance.value.previous),
  ).toFixed(2);
  return Number(percentage);
});

const onChartResize = (entries: ResizeObserverEntry[]) => {
  const entry = entries[0];
  currentChartWidth.value = entry.contentRect.width;
};
</script>

<style scoped>
.chart-fade-enter-active,
.chart-fade-leave-active {
  transition: opacity 0.2s ease;
}

.chart-fade-enter-from,
.chart-fade-leave-to {
  opacity: 0;
}
</style>
