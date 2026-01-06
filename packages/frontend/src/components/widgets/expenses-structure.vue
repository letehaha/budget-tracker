<template>
  <WidgetWrapper :is-fetching="isWidgetDataFetching">
    <template #title>
      <div class="flex items-center gap-2">
        Expenses Structure

        <template v-if="hasExcludedStats">
          <Popover.Popover>
            <Popover.PopoverTrigger class="px-1" as-child>
              <Button size="icon-sm" variant="ghost">
                <CircleOffIcon class="text-warning-text size-4" />
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
      <div class="relative">
        <highcharts :options="chartOptions" />

        <!-- Touch device overlay: shows category details + navigation button in center -->
        <div
          v-if="isTouch && selectedCategory"
          class="pointer-events-none absolute inset-0 flex items-center justify-center"
        >
          <div class="pointer-events-auto mt-4 flex flex-col items-center gap-1 text-center">
            <div class="text-xs">{{ selectedCategory.name }}</div>
            <div class="text-sm font-medium">
              {{ formatBaseCurrency(selectedCategory.amount) }}
            </div>
            <Button
              size="sm"
              variant="outline"
              class="mt-1 h-6 gap-1 px-2 text-xs"
              @click="navigateToTransactions({ categoryId: selectedCategoryId! })"
            >
              View
              <ExternalLinkIcon class="size-3" />
            </Button>
          </div>
        </div>
      </div>
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
import { ROUTES_NAMES } from '@/routes';
import { useCategoriesStore } from '@/stores';
import { TRANSACTION_TYPES } from '@bt/shared/types';
import { useQuery } from '@tanstack/vue-query';
import { useMediaQuery } from '@vueuse/core';
import { differenceInDays, subDays } from 'date-fns';
import { Chart as Highcharts } from 'highcharts-vue';
import { ChartPieIcon, CircleOffIcon, ExternalLinkIcon } from 'lucide-vue-next';
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

// Detect touch-primary devices (coarse pointer = finger/stylus)
const isTouch = useMediaQuery('(pointer: coarse)');

// Track selected category for touch devices (since there's no hover)
const selectedCategoryId = ref<number | null>(null);

const selectedCategory = computed(() => {
  if (!selectedCategoryId.value || !spendingsByCategories.value) return null;
  return spendingsByCategories.value[selectedCategoryId.value] || null;
});

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
    categories.forEach((cat) => {
      if (cat.parentId === parentId && !result.includes(cat.id)) {
        result.push(cat.id);
        findChildren(cat.id); // Recursively find children of children
      }
    });
  };

  findChildren(rootCategoryId);
  return result;
};

// Navigate to transactions page with category filter
const navigateToTransactions = ({ categoryId }: { categoryId: number }) => {
  const allCategoryIds = getAllCategoryIds(categoryId);

  router.push({
    name: ROUTES_NAMES.transactions,
    query: {
      categoryIds: allCategoryIds.map(String),
      start: props.selectedPeriod.from.toISOString(),
      end: props.selectedPeriod.to.toISOString(),
      transactionType: TRANSACTION_TYPES.expense,
    },
  });
};

// Clear selection when period changes
watch(
  () => props.selectedPeriod,
  () => {
    selectedCategoryId.value = null;
  },
);

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

  // For touch devices, disable the hover events (we handle selection via Vue overlay)
  // For non-touch devices, keep the hover events for the center label
  const existingEvents = baseConfig.plotOptions?.pie?.point?.events || {};
  const mouseEvents = isTouch.value
    ? { mouseOver: undefined, mouseOut: undefined }
    : { mouseOver: existingEvents.mouseOver, mouseOut: existingEvents.mouseOut };

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
            ...mouseEvents,
            click: function (this: Highcharts.Point) {
              const categoryData = spendingsByCategories.value;
              // Find the category ID by matching the category name
              const categoryId = Object.keys(categoryData || {}).find((id) => categoryData[+id]?.name === this.name);

              if (categoryId) {
                if (isTouch.value) {
                  // On touch devices, select the category to show details + button
                  selectedCategoryId.value = Number(categoryId);
                } else {
                  // On non-touch devices, navigate directly
                  navigateToTransactions({ categoryId: Number(categoryId) });
                }
              }
            },
          },
        },
      },
    },
  };
});
</script>
