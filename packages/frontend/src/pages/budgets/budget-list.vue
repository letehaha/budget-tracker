<script setup lang="ts">
import { deleteBudget as deleteBudgetApi, loadBudgetStats } from '@/api';
import { loadSystemBudgets } from '@/api/budgets';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/lib/ui/tabs';
import { useNotificationCenter } from '@/components/notification-center';
import { ROUTES_NAMES } from '@/routes';
import { BUDGET_TYPES, BudgetModel } from '@bt/shared/types';
import { useQueries, useQuery, useQueryClient } from '@tanstack/vue-query';
import { differenceInDays, isPast, isWithinInterval } from 'date-fns';
import { TagsIcon, WalletIcon } from 'lucide-vue-next';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';

import BudgetCardSkeleton from './budget-card-skeleton.vue';
import CategoryBudgetCard from './budget-list-cards/category-budget-card.vue';
import ManualBudgetCard from './budget-list-cards/manual-budget-card.vue';

const { t } = useI18n();
const { addErrorNotification, addSuccessNotification } = useNotificationCenter();
const router = useRouter();
const queryClient = useQueryClient();

const { data: budgetsList, isPlaceholderData: isBudgetsListPlaceholder } = useQuery({
  queryFn: () => loadSystemBudgets(),
  queryKey: VUE_QUERY_CACHE_KEYS.budgetsList,
  staleTime: Infinity,
  placeholderData: [],
});

const isBudgetsListLoading = computed(() => isBudgetsListPlaceholder.value);

const budgetStatsQueries = useQueries({
  queries: computed(() =>
    (budgetsList.value || []).map((budget: BudgetModel) => ({
      queryKey: [...VUE_QUERY_CACHE_KEYS.budgetStats, budget.id],
      queryFn: () => loadBudgetStats({ budgetId: budget.id }),
      staleTime: Infinity,
    })),
  ),
});

const getBudgetStats = (budgetId: number) => {
  const index = budgetsList.value?.findIndex((b: BudgetModel) => b.id === budgetId) ?? -1;
  if (index === -1) return null;
  return budgetStatsQueries.value[index]?.data ?? null;
};

const isBudgetStatsLoading = (budgetId: number) => {
  const index = budgetsList.value?.findIndex((b: BudgetModel) => b.id === budgetId) ?? -1;
  if (index === -1) return true;
  const query = budgetStatsQueries.value[index];
  if (!query) return true;
  if (query.isPending) return true;
  if (query.isFetching && !query.data) return true;
  if (query.data === undefined || query.data === null) return true;
  return false;
};

const navigateToBudget = ({ budgetId }: { budgetId: number }) => {
  router.push({ name: ROUTES_NAMES.budgetsInfo, params: { id: budgetId } });
};

const deleteBudget = async ({ budgetId }: { budgetId: number }) => {
  try {
    await deleteBudgetApi(budgetId);
    queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.budgetsList });
    addSuccessNotification(t('budgets.list.deleteSuccess'));
  } catch {
    addErrorNotification(t('budgets.list.deleteError'));
  }
};

const getBudgetTimeStatus = (budget: BudgetModel) => {
  if (!budget.startDate && !budget.endDate) return null;

  const now = new Date();
  const startDate = budget.startDate ? new Date(budget.startDate) : null;
  const endDate = budget.endDate ? new Date(budget.endDate) : null;

  if (endDate && isPast(endDate)) {
    return { status: 'ended' as const, text: t('budgets.list.status.ended') };
  }

  if (startDate && endDate && isWithinInterval(now, { start: startDate, end: endDate })) {
    const daysLeft = differenceInDays(endDate, now);
    if (daysLeft === 0) return { status: 'active' as const, text: t('budgets.list.status.lastDay') };
    if (daysLeft === 1) return { status: 'active' as const, text: t('budgets.list.status.oneDayLeft') };
    return { status: 'active' as const, text: t('budgets.list.status.daysLeft', { count: daysLeft }) };
  }

  if (startDate && !isPast(startDate)) {
    const daysUntil = differenceInDays(startDate, now);
    if (daysUntil === 0) return { status: 'upcoming' as const, text: t('budgets.list.status.startsToday') };
    if (daysUntil === 1) return { status: 'upcoming' as const, text: t('budgets.list.status.startsTomorrow') };
    return { status: 'upcoming' as const, text: t('budgets.list.status.startsInDays', { count: daysUntil }) };
  }

  if (endDate && !isPast(endDate)) {
    const daysLeft = differenceInDays(endDate, now);
    if (daysLeft === 0) return { status: 'active' as const, text: t('budgets.list.status.lastDay') };
    if (daysLeft === 1) return { status: 'active' as const, text: t('budgets.list.status.oneDayLeft') };
    return { status: 'active' as const, text: t('budgets.list.status.daysLeft', { count: daysLeft }) };
  }

  return null;
};

const activeTab = ref<BUDGET_TYPES>(BUDGET_TYPES.category);

// Sort priority: active/upcoming (0) > no dates (1) > ended (2)
const getBudgetSortPriority = (budget: BudgetModel): number => {
  const status = getBudgetTimeStatus(budget);
  if (!status) return 1; // No dates set
  if (status.status === 'ended') return 2;
  return 0; // active or upcoming
};

const sortBudgetsByStatus = (budgets: BudgetModel[]): BudgetModel[] => {
  return [...budgets].sort((a, b) => getBudgetSortPriority(a) - getBudgetSortPriority(b));
};

const categoryBudgets = computed(() =>
  sortBudgetsByStatus((budgetsList.value || []).filter((b: BudgetModel) => b.type === BUDGET_TYPES.category)),
);

const manualBudgets = computed(() =>
  sortBudgetsByStatus((budgetsList.value || []).filter((b: BudgetModel) => b.type === BUDGET_TYPES.manual)),
);
</script>

<template>
  <div>
    <!-- Loading Skeleton -->
    <BudgetCardSkeleton v-if="isBudgetsListLoading" />

    <template v-else-if="budgetsList.length">
      <Tabs v-model="activeTab" class="w-full">
        <TabsList class="mb-4">
          <TabsTrigger :value="BUDGET_TYPES.category">
            {{ $t('budgets.list.tabCategory') }}
            <span v-if="categoryBudgets.length" class="bg-muted ml-1.5 rounded-full px-1.5 py-0.5 text-xs">
              {{ categoryBudgets.length }}
            </span>
          </TabsTrigger>
          <TabsTrigger :value="BUDGET_TYPES.manual">
            {{ $t('budgets.list.tabManual') }}
            <span v-if="manualBudgets.length" class="bg-muted ml-1.5 rounded-full px-1.5 py-0.5 text-xs">
              {{ manualBudgets.length }}
            </span>
          </TabsTrigger>
        </TabsList>

        <!-- Category Budgets Tab -->
        <TabsContent :value="BUDGET_TYPES.category">
          <div v-if="categoryBudgets.length === 0" class="flex flex-col items-center justify-center py-12 text-center">
            <div class="bg-muted mb-4 flex size-16 items-center justify-center rounded-full">
              <TagsIcon class="text-muted-foreground size-8" />
            </div>
            <h3 class="mb-1 font-medium">{{ $t('budgets.list.emptyState.title') }}</h3>
            <p class="text-muted-foreground max-w-sm text-sm">
              {{ $t('budgets.list.emptyState.description') }}
            </p>
          </div>
          <div v-else class="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
            <CategoryBudgetCard
              v-for="budget in categoryBudgets"
              :key="budget.id"
              :budget="budget"
              :stats="getBudgetStats(budget.id)?.summary ?? null"
              :is-stats-loading="isBudgetStatsLoading(budget.id)"
              :time-status="getBudgetTimeStatus(budget)"
              @click="navigateToBudget({ budgetId: budget.id })"
              @edit="navigateToBudget({ budgetId: budget.id })"
              @delete="deleteBudget({ budgetId: budget.id })"
            />
          </div>
        </TabsContent>

        <!-- Manual Budgets Tab -->
        <TabsContent :value="BUDGET_TYPES.manual">
          <div v-if="manualBudgets.length === 0" class="flex flex-col items-center justify-center py-12 text-center">
            <div class="bg-muted mb-4 flex size-16 items-center justify-center rounded-full">
              <WalletIcon class="text-muted-foreground size-8" />
            </div>
            <h3 class="mb-1 font-medium">{{ $t('budgets.list.emptyState.title') }}</h3>
            <p class="text-muted-foreground max-w-sm text-sm">
              {{ $t('budgets.list.emptyState.description') }}
            </p>
          </div>
          <div v-else class="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
            <ManualBudgetCard
              v-for="budget in manualBudgets"
              :key="budget.id"
              :budget="budget"
              :stats="getBudgetStats(budget.id)?.summary ?? null"
              :is-stats-loading="isBudgetStatsLoading(budget.id)"
              :time-status="getBudgetTimeStatus(budget)"
              @click="navigateToBudget({ budgetId: budget.id })"
              @edit="navigateToBudget({ budgetId: budget.id })"
              @delete="deleteBudget({ budgetId: budget.id })"
            />
          </div>
        </TabsContent>
      </Tabs>
    </template>

    <template v-else>
      <div class="flex flex-col items-center justify-center py-12 text-center">
        <div class="bg-muted mb-4 flex size-16 items-center justify-center rounded-full">
          <WalletIcon class="text-muted-foreground size-8" />
        </div>
        <h3 class="mb-1 font-medium">{{ $t('budgets.list.emptyState.title') }}</h3>
        <p class="text-muted-foreground max-w-sm text-sm">
          {{ $t('budgets.list.emptyState.description') }}
        </p>
      </div>
    </template>
  </div>
</template>
