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

    <!-- Always show header section to prevent layout jumps -->
    <div>
      <div class="mb-1 flex items-center justify-between text-xs">
        <div class="font-medium tracking-tight uppercase">Today</div>
        <div class="tracking-tight">vs previous period</div>
      </div>

      <div class="flex items-center justify-between">
        <div class="text-lg font-bold tracking-wider">
          <template v-if="isWidgetDataFetching && !hasData">
            <div class="bg-muted h-7 w-24 animate-pulse rounded" />
          </template>
          <template v-else>
            {{ formatBaseCurrency(-(currentMonthExpense || 0)) }}
          </template>
        </div>

        <div
          :class="{
            'text-destructive-text': expensesDiff > 0,
            'text-success-text': expensesDiff < 0,
          }"
        >
          <template v-if="isWidgetDataFetching && !hasData">
            <div class="bg-muted h-5 w-12 animate-pulse rounded" />
          </template>
          <template v-else>
            {{ `${expensesDiff}%` }}
          </template>
        </div>
      </div>
    </div>

    <template v-if="isWidgetDataFetching && !hasData">
      <LoadingState />
    </template>
    <template v-else-if="isDataEmpty">
      <EmptyState>
        <ChartPieIcon class="size-32" />
      </EmptyState>
    </template>
    <template v-else>
      <highcharts :options="chartOptions" />
    </template>
  </WidgetWrapper>
</template>

<script lang="ts" setup>
import { getExpensesAmountForPeriod, getSpendingsByCategories } from '@/api';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import { ROUTES_NAMES } from '@/routes';
import CategoryCircle from '@/components/common/category-circle.vue';
import Button from '@/components/lib/ui/button/Button.vue';
import * as Popover from '@/components/lib/ui/popover';
import { useFormatCurrency, useHighcharts } from '@/composable';
import { useUserSettings } from '@/composable/data-queries/user-settings';
import { calculatePercentageDifference } from '@/js/helpers';
import { useCategoriesStore } from '@/stores';
import { TRANSACTION_TYPES } from '@bt/shared/types';
import { useQuery } from '@tanstack/vue-query';
import { differenceInDays, subDays } from 'date-fns';
import { Chart as Highcharts } from 'highcharts-vue';
import { ChartPieIcon, CircleOffIcon } from 'lucide-vue-next';
import { storeToRefs } from 'pinia';
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';

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
const router = useRouter();

// Include both from and to in query key to ensure cache invalidation when period changes
const periodQueryKey = ref(`${new Date().getTime()}-${new Date().getTime()}`);

const { data: userSettings } = useUserSettings();

const excludedCategories = computed(() =>
  userSettings.value ? userSettings.value.stats.expenses.excludedCategories : [],
);
const hasExcludedStats = computed(() => excludedCategories.value.length);

watch(
  () => props.selectedPeriod,
  () => {
    periodQueryKey.value = `${props.selectedPeriod.from.getTime()}-${props.selectedPeriod.to.getTime()}`;
  },
  { deep: true },
);

const { data: spendingsByCategories, isFetching: isSpendingsByCategoriesFetching } = useQuery({
  queryKey: [...VUE_QUERY_CACHE_KEYS.widgetExpensesStructureTotal, periodQueryKey],
  queryFn: () =>
    getSpendingsByCategories({
      from: props.selectedPeriod.from,
      to: props.selectedPeriod.to,
    }),
  staleTime: Infinity,
  placeholderData: (previousData) => previousData || {},
});

const { data: currentMonthExpense, isFetching: isCurrentMonthExpenseFetching } = useQuery({
  queryKey: [...VUE_QUERY_CACHE_KEYS.widgetExpensesStructureCurrentAmount, periodQueryKey],
  queryFn: () =>
    getExpensesAmountForPeriod({
      from: props.selectedPeriod.from,
      to: props.selectedPeriod.to,
    }),
  staleTime: Infinity,
  placeholderData: (previousData) => previousData || 0,
});

// Calculate previous period with the same duration, ending right before current period starts
const prevPeriod = computed(() => {
  const durationInDays = differenceInDays(props.selectedPeriod.to, props.selectedPeriod.from) + 1;
  const prevTo = subDays(props.selectedPeriod.from, 1); // Day before current period starts
  const prevFrom = subDays(props.selectedPeriod.from, durationInDays);

  return { from: prevFrom, to: prevTo };
});

const { data: prevMonthExpense, isFetching: isPrevMonthExpenseFetching } = useQuery({
  queryKey: [...VUE_QUERY_CACHE_KEYS.widgetExpensesStructurePrevAmount, periodQueryKey],
  queryFn: () =>
    getExpensesAmountForPeriod({
      from: prevPeriod.value.from,
      to: prevPeriod.value.to,
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
const hasData = computed(() => currentMonthExpense.value !== undefined && prevMonthExpense.value !== undefined);

// Helper function to get all category IDs including subcategories
const getAllCategoryIds = (rootCategoryId: number): number[] => {
  const result = [rootCategoryId];
  const categories = Object.values(categoriesMap.value);
  
  // Find all categories that have this category as parent
  const findChildren = (parentId: number) => {
    categories.forEach(cat => {
      if (cat.parentId === parentId && !result.includes(cat.id)) {
        result.push(cat.id);
        findChildren(cat.id); // Recursively find children of children
      }
    });
  };
  
  findChildren(rootCategoryId);
  return result;
};

const chartOptions = computed(() => {
  const baseConfig = buildDonutChartConfig({
    chart: { height: 220 },
    series: [
      {
        type: 'pie',
        data: chartSeries.value,
      },
    ],
  });

  // Preserve existing mouse events and add click event
  const existingEvents = baseConfig.plotOptions?.pie?.point?.events || {};
  
  return {
    ...baseConfig,
    plotOptions: {
      ...baseConfig.plotOptions,
      pie: {
        ...baseConfig.plotOptions?.pie,
        cursor: 'pointer',
        point: {
          ...baseConfig.plotOptions?.pie?.point,
          events: {
            ...existingEvents,
            click: function(this: Highcharts.Point) {
              const categoryData = spendingsByCategories.value;
              // Find the category ID by matching the category name
              const categoryId = Object.keys(categoryData || {}).find(
                id => categoryData[+id]?.name === this.name
              );

              if (categoryId) {
                // Get all category IDs including subcategories
                const allCategoryIds = getAllCategoryIds(Number(categoryId));
                
                // Navigate to transactions page with category filter
                router.push({
                  name: ROUTES_NAMES.transactions,
                  query: {
                    categoryIds: allCategoryIds.map(String),
                    start: props.selectedPeriod.from.toISOString(),
                    end: props.selectedPeriod.to.toISOString(),
                    transactionType: TRANSACTION_TYPES.expense
                  }
                });
              }
            }
          }
        }
      }
    }
  };
});
</script>
