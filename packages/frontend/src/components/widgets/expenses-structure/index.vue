<template>
  <WidgetWrapper :is-fetching="isWidgetDataFetching" class="max-h-auto" data-testid="widget-expenses-structure">
    <template #title>
      <div class="flex items-center gap-2">
        {{ $t('dashboard.widgets.expensesStructure.title') }}

        <ExcludedCategoriesPopover
          v-if="hasExcludedStats"
          :category-ids="excludedCategoryIds"
          @remove="handleRemoveExclusion"
        />
      </div>
    </template>

    <template v-if="widgetConfigRef" #action>
      <ExcludeSettingsPopover :excluded-category-ids="excludedCategoryIds" @save="persistExcludedCategories" />
    </template>

    <!-- Stats row - two columns with space between -->
    <div class="mb-4 flex items-start justify-between gap-4">
      <!-- Left: Primary value -->
      <div>
        <div class="text-2xl font-bold tracking-tight">
          <template v-if="isWidgetDataFetching && !hasData">
            <div class="bg-muted h-8 w-32 animate-pulse rounded" />
          </template>
          <template v-else>
            {{ formatBaseCurrency(animatedExpense) }}
          </template>
        </div>
        <div class="text-muted-foreground mt-1 text-xs font-medium tracking-tight uppercase">
          {{ periodLabel }}
        </div>
      </div>

      <!-- Right: Comparison -->
      <div class="flex flex-col items-end gap-1">
        <template v-if="isWidgetDataFetching && !hasData">
          <div class="bg-muted h-6 w-16 animate-pulse rounded-full" />
        </template>
        <template v-else>
          <span
            class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold"
            :class="{
              'bg-destructive-text/15 text-destructive-text': expensesDiff > 0,
              'bg-success-text/15 text-success-text': expensesDiff < 0,
              'bg-muted text-muted-foreground': expensesDiff === 0,
            }"
          >
            {{ expensesDiff > 0 ? '+' : '' }}{{ expensesDiff }}%
          </span>
        </template>
        <div class="text-muted-foreground text-xs tracking-tight">
          {{ $t('dashboard.widgets.expensesStructure.vsPreviousPeriod') }}
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
      <DonutChart :data="chartData" :total-amount="totalAmount" @category-click="navigateToTransactions" />
    </template>
  </WidgetWrapper>
</template>

<script lang="ts" setup>
import type { DashboardWidgetConfig } from '@/api/user-settings';
import { useFormatCurrency } from '@/composable';
import { ROUTES_NAMES } from '@/routes';
import { useCategoriesStore } from '@/stores';
import { TRANSACTION_TYPES } from '@bt/shared/types';
import { ChartPieIcon } from 'lucide-vue-next';
import { storeToRefs } from 'pinia';
import { type Ref, computed, inject } from 'vue';
import { useRouter } from 'vue-router';

import EmptyState from '../components/empty-state.vue';
import LoadingState from '../components/loading-state.vue';
import WidgetWrapper from '../components/widget-wrapper.vue';

import DonutChart from './donut-chart.vue';
import ExcludeSettingsPopover from './exclude-settings-popover.vue';
import ExcludedCategoriesPopover from './excluded-categories-popover.vue';
import { useExpensesStructureData } from './use-expenses-structure-data';

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

const widgetConfigRef = inject<Ref<DashboardWidgetConfig> | null>('dashboard-widget-config', null);
const saveWidgetConfig =
  inject<(params: { widgetId: string; config: Record<string, unknown> }) => Promise<void>>(
    'dashboard-save-widget-config',
  );

const excludedCategoryIds = computed<number[]>(() => {
  const ids = widgetConfigRef?.value?.config?.excludedCategoryIds;
  return Array.isArray(ids) ? (ids as number[]) : [];
});

const {
  hasExcludedStats,
  periodLabel,
  isWidgetDataFetching,
  animatedExpense,
  expensesDiff,
  chartData,
  isDataEmpty,
  hasData,
  totalAmount,
} = useExpensesStructureData({
  selectedPeriod: () => props.selectedPeriod,
  excludedCategoryIds,
});

const persistExcludedCategories = async ({ categoryIds }: { categoryIds: number[] }) => {
  if (!saveWidgetConfig || !widgetConfigRef?.value) return;

  await saveWidgetConfig({
    widgetId: widgetConfigRef.value.widgetId,
    config: { excludedCategoryIds: categoryIds },
  });
};

const handleRemoveExclusion = ({ categoryId }: { categoryId: number }) => {
  persistExcludedCategories({
    categoryIds: excludedCategoryIds.value.filter((id) => id !== categoryId),
  });
};

const getAllCategoryIds = (rootCategoryId: number): number[] => {
  const result = [rootCategoryId];
  const categories = Object.values(categoriesMap.value);

  const findChildren = (parentId: number) => {
    categories.forEach((cat) => {
      if (cat.parentId === parentId && !result.includes(cat.id)) {
        result.push(cat.id);
        findChildren(cat.id);
      }
    });
  };

  findChildren(rootCategoryId);
  return result;
};

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
</script>
