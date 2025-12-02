<template>
  <WidgetWrapper :is-fetching="isWidgetDataFetching">
    <template #title>
      <div class="flex items-center gap-2">
        Expenses Structure

        <template v-if="hasExcludedStats">
          <Popover.Popover>
            <Popover.PopoverTrigger class="px-1" as-child>
              <Button size="icon-sm" variant="ghost">
                <CircleOffIcon class="text-warning size-4" />
              </Button>
            </Popover.PopoverTrigger>
            <Popover.PopoverContent class="max-w-[300px] text-sm">
              <div>
                <p>
                  Some categories are excluded.
                  <router-link to="/settings/categories" class="text-primary hover:underline" as="span">
                    Update settings
                  </router-link>
                  to change this behavior.
                </p>
                <div class="mt-3 grid gap-2">
                  <template v-for="categoryId of excludedCategories" :key="categoryId">
                    <div class="flex items-center gap-2">
                      <CategoryCircle :category="categoriesMap[categoryId]" />

                      {{ categoriesMap[categoryId].name }}
                    </div>
                  </template>
                </div>
              </div>
            </Popover.PopoverContent>
          </Popover.Popover>
        </template>
      </div>
    </template>

    <template v-if="isWidgetDataFetching">
      <LoadingState />
    </template>
    <template v-else-if="isDataEmpty">
      <EmptyState>
        <ChartPieIcon class="size-32" />
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
            {{ formatBaseCurrency(-(currentMonthExpense || 0)) }}
          </div>

          <div
            :class="{
              'text-destructive-text': expensesDiff > 0,
              'text-success-text': expensesDiff < 0,
            }"
          >
            {{ `${expensesDiff}%` }}
          </div>
        </div>
      </div>

      <highcharts :options="chartOptions" />
    </template>
  </WidgetWrapper>
</template>

<script lang="ts" setup>
import { getExpensesAmountForPeriod, getSpendingsByCategories } from '@/api';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import CategoryCircle from '@/components/common/category-circle.vue';
import Button from '@/components/lib/ui/button/Button.vue';
import * as Popover from '@/components/lib/ui/popover';
import { useFormatCurrency, useHighcharts } from '@/composable';
import { useUserSettings } from '@/composable/data-queries/user-settings';
import { calculatePercentageDifference } from '@/js/helpers';
import { useCategoriesStore } from '@/stores';
import { useQuery } from '@tanstack/vue-query';
import { endOfMonth, startOfMonth, subMonths } from 'date-fns';
import { Chart as Highcharts } from 'highcharts-vue';
import { ChartPieIcon, CircleOffIcon } from 'lucide-vue-next';
import { storeToRefs } from 'pinia';
import { computed, ref, watch } from 'vue';

import EmptyState from './components/empty-state.vue';
import LoadingState from './components/loading-state.vue';
import WidgetWrapper from './components/widget-wrapper.vue';

defineOptions({
  name: 'expenses-structure-widget',
});

const props = defineProps<{
  selectedPeriod: { from: Date; to: Date };
}>();

const { formatBaseCurrency } = useFormatCurrency();
const categoriesStore = useCategoriesStore();
const { categoriesMap } = storeToRefs(categoriesStore);
const periodFrom = ref(new Date().getTime());

const { data: userSettings } = useUserSettings();

const excludedCategories = computed(() =>
  userSettings.value ? userSettings.value.stats.expenses.excludedCategories : [],
);
const hasExcludedStats = computed(() => excludedCategories.value.length);

watch(
  () => props.selectedPeriod.from,
  () => {
    periodFrom.value = props.selectedPeriod.from.getTime();
  },
);

const { data: spendingsByCategories, isFetching: isSpendingsByCategoriesFetching } = useQuery({
  queryKey: [...VUE_QUERY_CACHE_KEYS.widgetExpensesStructureTotal, periodFrom],
  queryFn: () =>
    getSpendingsByCategories({
      from: props.selectedPeriod.from,
      to: props.selectedPeriod.to,
    }),
  staleTime: Infinity,
  placeholderData: (previousData) => previousData || {},
});

const { data: currentMonthExpense, isFetching: isCurrentMonthExpenseFetching } = useQuery({
  queryKey: [...VUE_QUERY_CACHE_KEYS.widgetExpensesStructureCurrentAmount, periodFrom],
  queryFn: () =>
    getExpensesAmountForPeriod({
      from: props.selectedPeriod.from,
      to: props.selectedPeriod.to,
    }),
  staleTime: Infinity,
  placeholderData: (previousData) => previousData || 0,
});

const { data: prevMonthExpense, isFetching: isPrevMonthExpenseFetching } = useQuery({
  queryKey: [...VUE_QUERY_CACHE_KEYS.widgetExpensesStructurePrevAmount, periodFrom],
  queryFn: () =>
    getExpensesAmountForPeriod({
      from: startOfMonth(subMonths(props.selectedPeriod.from, 1)),
      to: endOfMonth(subMonths(props.selectedPeriod.to, 1)),
    }),
  staleTime: Infinity,
  placeholderData: (previousData) => previousData || 0,
});

const isWidgetDataFetching = computed(
  () =>
    isSpendingsByCategoriesFetching.value || isCurrentMonthExpenseFetching.value || isPrevMonthExpenseFetching.value,
);

const expensesDiff = computed(() => {
  const percentage = Number(
    calculatePercentageDifference(currentMonthExpense.value || 0, prevMonthExpense.value || 0),
  ).toFixed(2);
  return Number(percentage);
});

const { buildDonutChartConfig } = useHighcharts();

const chartSeries = computed(() =>
  Object.values(spendingsByCategories.value || {}).map((value) => ({
    name: value.name,
    color: value.color,
    y: value.amount,
  })),
);

const isDataEmpty = computed(() => chartSeries.value.length === 0);

const chartOptions = computed(() =>
  buildDonutChartConfig({
    chart: { height: 220 },
    series: [
      {
        type: 'pie',
        data: chartSeries.value,
      },
    ],
  }),
);
</script>
