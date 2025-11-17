<template>
  <WidgetWrapper :is-fetching="isWidgetDataFetching">
    <template #title>
      <div class="flex w-full items-center gap-4">
        <span>Balance trend</span>
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
    <template v-if="isWidgetDataFetching">
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
          <div class="font-medium tracking-tight uppercase">Today</div>
          <div class="tracking-tight">vs previous period</div>
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

      <highcharts v-node-resize-observer="{ callback: onChartResize }" :options="chartOptions" />
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
import { startOfDay } from 'date-fns';
import { Chart as Highcharts } from 'highcharts-vue';
import { ChartLineIcon } from 'lucide-vue-next';
import { storeToRefs } from 'pinia';
import { computed, ref, watch } from 'vue';

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

const balanceTypeOptions = [
  { value: 'total' as const, label: 'Total' },
  { value: 'accounts' as const, label: 'Accounts' },
  { value: 'portfolios' as const, label: 'Portfolios' },
];
const currentChartWidth = ref(0);
const selectedBalanceType = ref(balanceTypeOptions[0]);
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
  queryFn: () => loadCombinedBalanceTrendData(props.selectedPeriod),
  staleTime: Infinity,
  placeholderData: (prevData) => prevData,
});

const isWidgetDataFetching = computed(() => isBalanceHistoryFetching.value);

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
        const dataPoint = balanceHistory.value?.find((point) => new Date(point.date).getTime() === this.x);

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
        animation: false,
        data: (balanceHistory.value || []).map((point) => {
          const value =
            selectedBalanceType.value.value === 'total'
              ? point.totalBalance
              : selectedBalanceType.value.value === 'accounts'
                ? point.accountsBalance
                : point.portfoliosBalance;
          return [new Date(point.date).getTime(), value];
        }),
      },
    ],
  });

  return config;
});

const displayBalance = computed(() => {
  if (!balanceHistory.value || balanceHistory.value.length === 0) return { current: 0, previous: 0 };

  // Get the latest balance entry
  const latestEntry = balanceHistory.value[balanceHistory.value.length - 1];
  const firstEntry = balanceHistory.value[0];

  switch (selectedBalanceType.value.value) {
    case 'accounts':
      return { current: latestEntry.accountsBalance || 0, previous: firstEntry.accountsBalance || 0 };
    case 'portfolios':
      return { current: latestEntry.portfoliosBalance || 0, previous: firstEntry.portfoliosBalance || 0 };
    case 'total':
    default:
      return { current: latestEntry.totalBalance || 0, previous: firstEntry.totalBalance || 0 };
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
