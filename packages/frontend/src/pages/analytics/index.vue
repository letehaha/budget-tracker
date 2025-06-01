<template>
  <div class="analytics">
    Analytics

    <div class="analytics__block">
      <div class="analytics__block-dropdown">
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

defineOptions({
  name: 'analytics-root',
});

// const Dropdown = defineAsyncComponent(() => import('@/components/common/dropdown.vue'));

const { buildAreaChartConfig } = useHighcharts();
const currentChartWidth = ref(null);
const timePeriods = [
  { value: 7, label: '7 days' },
  { value: 30, label: '30 days' },
  { value: 90, label: '90 days' },
];
const isDropdownVisible = ref(false);
const currentTimePeriod = ref<(typeof timePeriods)[0]>(timePeriods[0]);

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

<style lang="scss">
.analytics {
  padding: 24px;
}
.analytics__block {
  padding: 24px;
  border-radius: 12px;
}
.analytics__block-dropdown {
  position: relative;
}
</style>
