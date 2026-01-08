<template>
  <div class="p-6">
    {{ $t('analytics.title') }}

    <div class="rounded-xl p-4">
      <div class="relative">
        <button type="button" @click="isDropdownVisible = !isDropdownVisible">
          {{ currentTimePeriod.label }}
        </button>

        <!-- <dropdown
          :is-visible="isDropdownVisible"
          :values="timePeriods"
          :selected-value="currentTimePeriod"
          @select="selectPeriod"
        /> -->
      </div>

      <highcharts
        v-node-resize-observer="{ callback: onChartResize }"
        class="balance-trend-widget__chart"
        :options="chartOptions"
      />
    </div>
  </div>
</template>

<script lang="ts" setup>
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import { useHighcharts } from '@/composable';
import { loadBalanceTrendData } from '@/services';
import { useQuery } from '@tanstack/vue-query';
import { subDays } from 'date-fns';
import { Chart as Highcharts } from 'highcharts-vue';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

defineOptions({
  name: 'analytics-root',
});

// const Dropdown = defineAsyncComponent(() => import('@/components/common/dropdown.vue'));

const { t } = useI18n();
const { buildAreaChartConfig } = useHighcharts();
const currentChartWidth = ref(null);
const timePeriods = computed(() => [
  { value: 7, label: t('analytics.timePeriods.days', { count: 7 }) },
  { value: 30, label: t('analytics.timePeriods.days', { count: 30 }) },
  { value: 90, label: t('analytics.timePeriods.days', { count: 90 }) },
]);
const isDropdownVisible = ref(false);
const currentTimePeriod = ref<{ value: number; label: string }>(timePeriods.value[0]);

const { data: balanceHistory } = useQuery({
  queryKey: [...VUE_QUERY_CACHE_KEYS.analyticsBalanceHistoryTrend, currentTimePeriod],
  queryFn: () =>
    loadBalanceTrendData({
      from: subDays(new Date(), currentTimePeriod.value.value),
    }),
  staleTime: Infinity,
  placeholderData: [],
});

const chartOptions = computed(() =>
  buildAreaChartConfig({
    chart: { height: 350 },
    series: [
      {
        type: 'area',
        showInLegend: false,
        data: balanceHistory.value.map((point) => [new Date(point.date).getTime(), point.amount]),
      },
    ],
  }),
);

const onChartResize = (entries: ResizeObserverEntry[]) => {
  const entry = entries[0];
  currentChartWidth.value = entry.contentRect.width;
};

// const selectPeriod = ({ item }) => {
//   currentTimePeriod.value = item;
//   isDropdownVisible.value = false;
// };
</script>
