<script setup lang="ts">
import { loadBudgetSpendingStats } from '@/api/budgets';
import { QUERY_CACHE_STALE_TIME, VUE_QUERY_CACHE_KEYS } from '@/common/const';
import Card from '@/components/lib/ui/card/Card.vue';
import PillTabs from '@/components/lib/ui/pill-tabs/pill-tabs.vue';
import { useQuery } from '@tanstack/vue-query';
import { BarChart3Icon, LoaderCircleIcon, TriangleAlertIcon } from 'lucide-vue-next';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

import BudgetCategoryChart from './budget-category-chart.vue';
import BudgetTimelineChart from './budget-timeline-chart.vue';

const props = defineProps<{
  budgetId: number;
}>();

const { t } = useI18n();

const { data, isLoading, isError } = useQuery({
  queryFn: () => loadBudgetSpendingStats({ budgetId: props.budgetId }),
  queryKey: [...VUE_QUERY_CACHE_KEYS.budgetSpendingStats, props.budgetId],
  staleTime: QUERY_CACHE_STALE_TIME.ANALYTICS,
});

const activeChart = ref('categories');
const chartTabs = computed(() => [
  { value: 'categories', label: t('pages.budgetDetails.statistics.tabs.categories') },
  { value: 'timeline', label: t('pages.budgetDetails.statistics.tabs.timeline') },
]);
</script>

<template>
  <div>
    <!-- Loading state -->
    <Card v-if="isLoading" class="flex items-center justify-center py-16">
      <LoaderCircleIcon class="text-muted-foreground size-8 animate-spin" />
    </Card>

    <!-- Error state -->
    <Card v-else-if="isError" class="flex flex-col items-center justify-center py-12 text-center">
      <div class="bg-muted mb-4 flex size-16 items-center justify-center rounded-full">
        <TriangleAlertIcon class="text-muted-foreground size-8" />
      </div>
      <h3 class="mb-1 font-medium">{{ $t('pages.budgetDetails.statistics.errorTitle') }}</h3>
      <p class="text-muted-foreground max-w-sm text-sm">{{ $t('pages.budgetDetails.statistics.errorDescription') }}</p>
    </Card>

    <!-- Empty state -->
    <Card
      v-else-if="data && data.spendingsByCategory.length === 0 && data.spendingOverTime.periods.length === 0"
      class="flex flex-col items-center justify-center py-12 text-center"
    >
      <div class="bg-muted mb-4 flex size-16 items-center justify-center rounded-full">
        <BarChart3Icon class="text-muted-foreground size-8" />
      </div>
      <h3 class="mb-1 font-medium">{{ $t('pages.budgetDetails.statistics.noDataTitle') }}</h3>
      <p class="text-muted-foreground max-w-sm text-sm">{{ $t('pages.budgetDetails.statistics.noDataDescription') }}</p>
    </Card>

    <!-- Data state -->
    <Card v-else-if="data" class="p-4 @md:p-6">
      <PillTabs v-model="activeChart" :items="chartTabs" size="sm" class="mb-6" />

      <BudgetCategoryChart v-if="activeChart === 'categories'" :data="data.spendingsByCategory" />
      <BudgetTimelineChart
        v-else
        :data="data.spendingOverTime.periods"
        :granularity="data.spendingOverTime.granularity"
      />
    </Card>
  </div>
</template>
