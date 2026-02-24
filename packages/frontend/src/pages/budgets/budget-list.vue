<script setup lang="ts">
import { deleteBudget as deleteBudgetApi, loadBudgetStats } from '@/api';
import { archiveBudget as archiveBudgetApi, loadSystemBudgets } from '@/api/budgets';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import PillTabs from '@/components/lib/ui/pill-tabs/pill-tabs.vue';
import { useNotificationCenter } from '@/components/notification-center';
import { ROUTES_NAMES } from '@/routes';
import { BUDGET_STATUSES, BUDGET_TYPES, BudgetModel } from '@bt/shared/types';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/vue-query';
import { useLocalStorage } from '@vueuse/core';
import { differenceInDays, isPast, isWithinInterval } from 'date-fns';
import { ArchiveRestoreIcon, TagsIcon, WalletIcon } from 'lucide-vue-next';
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

const showArchived = ref(false);

const statusFilter = computed(() => (showArchived.value ? 'active,archived' : 'active'));

const {
  data: budgetsList,
  isPlaceholderData: isBudgetsListPlaceholder,
  isFetching: isBudgetsListFetching,
} = useQuery({
  queryFn: () => loadSystemBudgets({ status: statusFilter.value }),
  queryKey: [...VUE_QUERY_CACHE_KEYS.budgetsList, statusFilter],
  staleTime: Infinity,
  placeholderData: (previousData) => previousData ?? [],
});

// True only on very first load when we have no data at all
const isInitialLoading = computed(() => isBudgetsListPlaceholder.value && !budgetsList.value?.length);
// True when we have existing data but are fetching updated results (e.g. toggling archived)
const isLoadingMore = computed(() => isBudgetsListFetching.value && !isInitialLoading.value);

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
  router.push({ name: ROUTES_NAMES.plannedBudgetDetails, params: { id: budgetId } });
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

const { mutate: archiveBudget } = useMutation({
  mutationFn: archiveBudgetApi,
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.budgetsList });
  },
  onError: () => {
    addErrorNotification(t('budgets.list.archiveError'));
  },
});

const handleArchive = ({ budgetId, isArchived }: { budgetId: number; isArchived: boolean }) => {
  archiveBudget({ budgetId, isArchived });
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

const activeTab = useLocalStorage<BUDGET_TYPES>('budgets-active-tab', BUDGET_TYPES.category);

const isArchived = (budget: BudgetModel) => budget.status === BUDGET_STATUSES.archived;

// Sort priority: active/upcoming (0) > no dates (1) > ended (2) > archived (3)
const getBudgetSortPriority = (budget: BudgetModel): number => {
  if (isArchived(budget)) return 3;
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

const tabItems = computed(() => [
  {
    value: BUDGET_TYPES.category,
    label: categoryBudgets.value.length
      ? `${t('budgets.list.tabCategory')}  (${categoryBudgets.value.length})`
      : t('budgets.list.tabCategory'),
  },
  {
    value: BUDGET_TYPES.manual,
    label: manualBudgets.value.length
      ? `${t('budgets.list.tabManual')}  (${manualBudgets.value.length})`
      : t('budgets.list.tabManual'),
  },
]);
</script>

<template>
  <div>
    <!-- Initial full-page skeleton (no data yet) -->
    <BudgetCardSkeleton v-if="isInitialLoading" />

    <template v-else-if="budgetsList.length || isLoadingMore">
      <div class="mb-4 flex flex-wrap items-center justify-between gap-2">
        <PillTabs v-model="activeTab" :items="tabItems" />

        <button
          type="button"
          class="text-muted-foreground hover:text-foreground flex shrink-0 items-center gap-1.5 text-xs transition-colors"
          @click="showArchived = !showArchived"
        >
          <ArchiveRestoreIcon class="size-3.5" />
          {{ showArchived ? $t('budgets.list.hideArchived') : $t('budgets.list.showArchived') }}
        </button>
      </div>

      <!-- Category Budgets Tab -->
      <div v-if="activeTab === BUDGET_TYPES.category">
        <div
          v-if="categoryBudgets.length === 0 && !isLoadingMore"
          class="flex flex-col items-center justify-center py-12 text-center"
        >
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
            :is-archived="isArchived(budget)"
            :stats="getBudgetStats(budget.id)?.summary ?? null"
            :is-stats-loading="isBudgetStatsLoading(budget.id)"
            :time-status="getBudgetTimeStatus(budget)"
            @click="navigateToBudget({ budgetId: budget.id })"
            @edit="navigateToBudget({ budgetId: budget.id })"
            @delete="deleteBudget({ budgetId: budget.id })"
            @archive="handleArchive({ budgetId: budget.id, isArchived: !isArchived(budget) })"
          />
          <BudgetCardSkeleton v-if="isLoadingMore" :count="2" inline />
        </div>
      </div>

      <!-- Manual Budgets Tab -->
      <div v-if="activeTab === BUDGET_TYPES.manual">
        <div
          v-if="manualBudgets.length === 0 && !isLoadingMore"
          class="flex flex-col items-center justify-center py-12 text-center"
        >
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
            :is-archived="isArchived(budget)"
            :stats="getBudgetStats(budget.id)?.summary ?? null"
            :is-stats-loading="isBudgetStatsLoading(budget.id)"
            :time-status="getBudgetTimeStatus(budget)"
            @click="navigateToBudget({ budgetId: budget.id })"
            @edit="navigateToBudget({ budgetId: budget.id })"
            @delete="deleteBudget({ budgetId: budget.id })"
            @archive="handleArchive({ budgetId: budget.id, isArchived: !isArchived(budget) })"
          />
          <BudgetCardSkeleton v-if="isLoadingMore" :count="2" inline />
        </div>
      </div>
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
