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

    <!-- Category Transactions Dialog -->
    <Dialog.Dialog v-model:open="isDialogOpen">
      <Dialog.DialogContent class="bg-card max-h-[90dvh] w-full max-w-[900px] p-0">
        <Dialog.DialogHeader class="p-6 pb-0">
          <Dialog.DialogTitle class="text-lg font-semibold">
            {{ selectedCategory?.name }} Transactions
          </Dialog.DialogTitle>
          <Dialog.DialogDescription class="text-sm text-muted-foreground">
            {{ formatBaseCurrency(-(selectedCategoryAmount || 0)) }} spent on {{ selectedCategory?.name }} this period
          </Dialog.DialogDescription>
        </Dialog.DialogHeader>

        <div class="p-6 pt-4">
          <template v-if="isFetched && transactions">
            <TransactionsList
              :transactions="transactions"
              :has-next-page="hasNextPage"
              :is-fetching-next-page="isFetchingNextPage"
              :paginate="true"
              @fetch-next-page="fetchNextPage"
            />
          </template>
          <template v-else>
            <div class="flex items-center justify-center py-8">
              <div class="text-sm text-muted-foreground">Loading transactions...</div>
            </div>
          </template>
        </div>
      </Dialog.DialogContent>
    </Dialog.Dialog>
  </WidgetWrapper>
</template>

<script lang="ts" setup>
import { getExpensesAmountForPeriod, getSpendingsByCategories } from '@/api';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import CategoryCircle from '@/components/common/category-circle.vue';
import Button from '@/components/lib/ui/button/Button.vue';
import * as Dialog from '@/components/lib/ui/dialog';
import * as Popover from '@/components/lib/ui/popover';
import TransactionsList from '@/components/transactions-list/transactions-list.vue';
import { useFormatCurrency, useHighcharts, useTransactions } from '@/composable';
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

// Dialog state
const isDialogOpen = ref(false);
const selectedCategory = ref<{ id: number; name: string } | null>(null);

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

const chartOptions = computed(() =>
  buildDonutChartConfig({
    chart: { height: 220 },
    plotOptions: {
      pie: {
        point: {
          events: {
            click: function() {
              const categoryData = spendingsByCategories.value;
              const category = Object.values(categoryData || {}).find(cat => cat.name === this.name);

              if (category) {
                selectedCategory.value = { id: category.id, name: category.name };
                isDialogOpen.value = true;
              }
            }
          }
        }
      }
    },
    series: [
      {
        type: 'pie',
        data: chartSeries.value,
      },
    ],
  }),
);

// Transactions query for the selected category
const { transactionsPages, fetchNextPage, hasNextPage, isFetchingNextPage, isFetched } = useTransactions({
  filters: computed(() => ({
    transactionType: TRANSACTION_TYPES.expense,
    start: selectedCategory.value ? props.selectedPeriod.from : undefined,
    end: selectedCategory.value ? props.selectedPeriod.to : undefined,
    categoryIds: selectedCategory.value ? [selectedCategory.value.id] : undefined,
  })),
  limit: 50,
  queryOptions: {
    enabled: computed(() => selectedCategory.value !== null),
    queryKey: computed(() => ['category-transactions', selectedCategory.value?.id, props.selectedPeriod.from, props.selectedPeriod.to]),
  },
});

const transactions = computed(() => transactionsPages.value?.pages.flat() || []);

// Get the amount for the selected category
const selectedCategoryAmount = computed(() => {
  if (!selectedCategory.value) return 0;
  const categoryData = spendingsByCategories.value;
  const category = Object.values(categoryData || {}).find(cat => cat.id === selectedCategory.value?.id);
  return category?.amount || 0;
});
</script>
