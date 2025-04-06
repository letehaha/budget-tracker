<template>
  <WidgetWrapper :is-fetching="isWidgetDataFetching">
    <template #title> Balance trend </template>
    <template v-if="isDataEmpty">
      <EmptyState>
        <ChartLineIcon class="size-32" />
      </EmptyState>
    </template>
    <template v-else>
      <div>
        <div class="flex items-center justify-between mb-1 text-xs">
          <div class="font-medium tracking-tight uppercase">Today</div>
          <div class="tracking-tight">vs previous period</div>
        </div>

        <div class="flex items-center justify-between">
          <div class="text-lg font-bold tracking-wider">
            {{ formatBaseCurrency(todayBalance) }}
          </div>
          <div
            :class="{
              'text-[var(--app-error)]': balancesDiff < 0,
              'text-[var(--app-success)]': balancesDiff > 0,
            }"
          >
            {{ `${balancesDiff}%` }}
          </div>
        </div>
      </div>

      <highcharts v-node-resize-observer="{ callback: onChartResize }" :options="chartOptions" />
    </template>
  </WidgetWrapper>
</template>

<script lang="ts" setup>
import { getTotalBalance } from '@/api';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import { useFormatCurrency, useHighcharts } from '@/composable';
import { calculatePercentageDifference, formatLargeNumber } from '@/js/helpers';
import { loadBalanceTrendData } from '@/services';
import { useCurrenciesStore } from '@/stores';
import { useQuery } from '@tanstack/vue-query';
import { addDays, endOfMonth, getDaysInMonth, startOfDay, startOfMonth, subMonths } from 'date-fns';
import { Chart as Highcharts } from 'highcharts-vue';
import { ChartLineIcon } from 'lucide-vue-next';
import { storeToRefs } from 'pinia';
import { computed, ref, watch } from 'vue';

import EmptyState from './components/empty-state.vue';
import WidgetWrapper from './components/widget-wrapper.vue';

// Calculate it manually so shart will always have first and last ticks (dates)
function generateDateSteps(datesToShow = 5, date = new Date()) {
  const start = startOfMonth(date).getTime();
  const end = startOfDay(endOfMonth(date)).getTime();
  const monthDuration = end - start;
  const dates = [start];

  for (let i = 1; i < datesToShow - 1; i++) {
    const nextDate = start + (monthDuration * i) / (datesToShow - 1);
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

const currentChartWidth = ref(0);
const { formatBaseCurrency } = useFormatCurrency();
const { baseCurrency } = storeToRefs(useCurrenciesStore());
const { buildAreaChartConfig } = useHighcharts();

// We store actual and prev period separately, so when new data is loading, we
// can still show the old period, to avoid UI flickering
const actualDataPeriod = ref(props.selectedPeriod);
const prevDataPeriod = ref(props.selectedPeriod);
const periodQueryKey = computed(() => props.selectedPeriod.from.getTime());

const { data: balanceHistory, isFetching: isBalanceHistoryFetching } = useQuery({
  queryKey: [...VUE_QUERY_CACHE_KEYS.widgetBalanceTrend, periodQueryKey],
  queryFn: () => loadBalanceTrendData(props.selectedPeriod),
  staleTime: Infinity,
  placeholderData: (prevData) => prevData,
});
const { data: todayBalance, isFetching: isTodayBalanceFetching } = useQuery({
  queryKey: [...VUE_QUERY_CACHE_KEYS.widgetBalanceTotalBalance, periodQueryKey],
  queryFn: () => getTotalBalance({ date: props.selectedPeriod.to }),
  placeholderData: (prevData) => prevData || 0,
  staleTime: Infinity,
});
const { data: previousBalance, isFetching: isPreviousBalanceFetching } = useQuery({
  queryKey: [...VUE_QUERY_CACHE_KEYS.widgetBalancePreviousBalance, periodQueryKey],
  queryFn: () =>
    getTotalBalance({
      date: endOfMonth(subMonths(props.selectedPeriod.to, 1)),
    }),
  placeholderData: (prevData) => prevData || 0,
  staleTime: Infinity,
});

const isWidgetDataFetching = computed(
  () => isBalanceHistoryFetching.value || isTodayBalanceFetching.value || isPreviousBalanceFetching.value,
);

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

const isDataEmpty = computed(() => !balanceHistory.value || balanceHistory.value.every((i) => i.amount === 0));

const chartOptions = computed(() => {
  const pixelsPerTick = 120;
  const ticksAmount = currentChartWidth.value ? Math.round(currentChartWidth.value / pixelsPerTick) : 5;

  const fromDate = actualDataPeriod.value.from;
  const toDate = actualDataPeriod.value.to;

  const xAxisTicks = generateDateSteps(ticksAmount, fromDate);

  const config = buildAreaChartConfig({
    chart: {
      height: 220,
      marginTop: 20,
      animation: false,
    },
    plotOptions: {
      series: {
        animation: false,
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
        animation: false,
        data: [
          ...(balanceHistory.value || []).map((point) => [new Date(point.date).getTime(), point.amount]),
          // fill remaining days with `null` so chart will be rendered for all
          // days in the month
          ...Array(getDaysInMonth(toDate) - toDate.getDate())
            .fill([])
            .map((_, i) => [addDays(toDate, i + 1).getTime(), null]),
        ],
      },
    ],
  });

  return config;
});
const balancesDiff = computed<number>(() => {
  if (!todayBalance.value || !previousBalance.value) return 0;

  const percentage = Number(calculatePercentageDifference(todayBalance.value, previousBalance.value)).toFixed(2);
  return Number(percentage);
});

const onChartResize = (entries: ResizeObserverEntry[]) => {
  const entry = entries[0];
  currentChartWidth.value = entry.contentRect.width;
};
</script>
