<script setup lang="ts">
import { deleteBudget as deleteBudgetApi } from '@/api';
import {
  type CategoryBudgetTransaction,
  archiveBudget as archiveBudgetApi,
  editBudget,
  loadBudgetById,
  loadBudgetStats,
  loadCategoryBudgetTransactions,
} from '@/api/budgets';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import { AlertDialog } from '@/components/common';
import ResponsiveDialog from '@/components/common/responsive-dialog.vue';
import { buttonVariants } from '@/components/lib/ui/button';
import Button from '@/components/lib/ui/button/Button.vue';
import Card from '@/components/lib/ui/card/Card.vue';
import { useNotificationCenter } from '@/components/notification-center';
import { useFormatCurrency } from '@/composable';
import { BUDGET_STATUSES } from '@bt/shared/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { format } from 'date-fns';
import { cloneDeep } from 'lodash-es';
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  ArrowRightIcon,
  CalendarIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronUpIcon,
  LayersIcon,
  PencilIcon,
  TagIcon,
  Trash2Icon,
} from 'lucide-vue-next';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';

import BudgetDetailSkeleton from './budget-detail-skeleton.vue';
import CategoryBudgetEditForm from './category-budget-edit-form.vue';
import BudgetStatsCards from './shared/budget-stats-cards.vue';
import BudgetUtilizationBar from './shared/budget-utilization-bar.vue';
import { useBudgetDetails } from './shared/use-budget-details';

const route = useRoute();
const router = useRouter();
const queryClient = useQueryClient();
const { formatBaseCurrency } = useFormatCurrency();
const { addSuccessNotification, addErrorNotification } = useNotificationCenter();
const { t } = useI18n();
const budgetData = ref();
const currentBudgetId = ref<number>(Number(route.params.id));
const isEditDialogOpen = ref(false);
const isCategoriesExpanded = ref(false);
const transactionsFrom = ref(0);
const transactionsLimit = ref(50);

const { data: budgetStats } = useQuery({
  queryFn: () => loadBudgetStats({ budgetId: currentBudgetId.value }),
  queryKey: [...VUE_QUERY_CACHE_KEYS.budgetStats, currentBudgetId],
  staleTime: 30_000,
});

const { data: budgetItem } = useQuery({
  queryFn: () => loadBudgetById(currentBudgetId.value),
  queryKey: [VUE_QUERY_CACHE_KEYS.budgetsListItem, currentBudgetId.value],
  staleTime: Infinity,
});

const { stats, transactionDateRange, getBudgetTimeStatus, utilizationColor, utilizationTextColor } = useBudgetDetails({
  budgetStats,
  budgetData,
});

// Load category budget transactions
const {
  data: transactionsData,
  isLoading: isLoadingTransactions,
  isFetching: isFetchingTransactions,
} = useQuery({
  queryFn: () =>
    loadCategoryBudgetTransactions({
      budgetId: currentBudgetId.value,
      from: 0,
      limit: transactionsFrom.value + transactionsLimit.value,
    }),
  queryKey: [...VUE_QUERY_CACHE_KEYS.budgetStats, 'transactions', currentBudgetId, transactionsFrom],
  staleTime: 30_000,
});

const transactions = computed(() => transactionsData.value?.transactions || []);
const totalTransactions = computed(() => transactionsData.value?.total || 0);
const hasMoreTransactions = computed(() => transactions.value.length < totalTransactions.value);

const loadMoreTransactions = () => {
  transactionsFrom.value += transactionsLimit.value;
};

const { mutateAsync, isPending: isBudgetDataUpdating } = useMutation({
  mutationFn: editBudget,
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.budgetsList });
    queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.budgetStats });
    queryClient.invalidateQueries({ queryKey: [VUE_QUERY_CACHE_KEYS.budgetsListItem, currentBudgetId.value] });
  },
});

const handleSaveFromDialog = async (payload: { name: string; limitAmount: number; categoryIds: number[] }) => {
  await mutateAsync({
    budgetId: currentBudgetId.value,
    payload,
  });
  addSuccessNotification(t('budgets.list.updateSuccess'));
  isEditDialogOpen.value = false;
};

const handleDeleteBudget = async () => {
  try {
    await deleteBudgetApi(currentBudgetId.value);
    queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.budgetsList });
    addSuccessNotification(t('budgets.list.deleteSuccess'));
    router.push('/budgets');
  } catch {
    addErrorNotification(t('budgets.list.deleteError'));
  }
};

const isBudgetArchived = computed(() => budgetData.value?.status === BUDGET_STATUSES.archived);

const { mutate: toggleArchive } = useMutation({
  mutationFn: archiveBudgetApi,
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.budgetsList });
    queryClient.invalidateQueries({ queryKey: [VUE_QUERY_CACHE_KEYS.budgetsListItem, currentBudgetId.value] });
  },
  onError: () => {
    addErrorNotification(t('budgets.list.archiveError'));
  },
});

const handleToggleArchive = () => {
  toggleArchive({ budgetId: currentBudgetId.value, isArchived: !isBudgetArchived.value });
};

watch(
  budgetItem,
  (item) => {
    if (item) {
      budgetData.value = cloneDeep(item);
      budgetData.value.categoryIds = item.categories?.map((c: { id: number }) => c.id) ?? [];
    }
  },
  { immediate: true },
);

const formatTransactionDate = (date: string) => {
  return format(new Date(date), 'MMM d, yyyy');
};

// Category breakdown computed
const categoryBreakdown = computed(() => {
  if (!transactions.value.length) return [];

  const breakdown = new Map<number, { category: CategoryBudgetTransaction['effectiveCategory']; amount: number }>();

  for (const tx of transactions.value) {
    if (!tx.effectiveCategory) continue;

    const existing = breakdown.get(tx.effectiveCategory.id);
    const amount = tx.effectiveRefAmount || tx.refAmount;

    if (existing) {
      existing.amount += amount;
    } else {
      breakdown.set(tx.effectiveCategory.id, {
        category: tx.effectiveCategory,
        amount,
      });
    }
  }

  return Array.from(breakdown.values()).sort((a, b) => b.amount - a.amount);
});

const totalBreakdownAmount = computed(() => categoryBreakdown.value.reduce((sum, item) => sum + item.amount, 0));
</script>

<template>
  <div v-if="budgetData" class="@container max-w-5xl p-6">
    <!-- Back Button & Header -->
    <div class="mb-6">
      <router-link
        to="/budgets"
        :class="[
          buttonVariants({ size: 'sm', variant: 'ghost' }),
          'text-muted-foreground hover:text-foreground mb-4 -ml-2 gap-1',
        ]"
      >
        <ChevronLeftIcon class="size-4" />
        {{ $t('budgets.categoryBudget.backToBudgets') }}
      </router-link>

      <!-- Hero Header -->
      <div class="flex flex-col gap-4 @md:flex-row @md:items-center @md:justify-between">
        <div class="flex items-center gap-4">
          <div class="bg-primary/10 flex size-12 shrink-0 items-center justify-center rounded-xl">
            <LayersIcon class="text-primary size-6" />
          </div>
          <div>
            <div class="flex items-center gap-3">
              <h1 class="text-2xl font-semibold tracking-tight">{{ budgetData.name }}</h1>
              <span class="bg-primary/10 text-primary rounded-full px-2.5 py-1 text-xs font-medium">
                {{ $t('budgets.list.autoTracked') }}
              </span>
              <span
                v-if="isBudgetArchived"
                class="bg-muted text-muted-foreground inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium"
              >
                <ArchiveIcon class="size-3" />
                {{ $t('budgets.list.archivedLabel') }}
              </span>
              <span
                v-if="getBudgetTimeStatus"
                :class="[
                  'rounded-full px-2.5 py-1 text-xs font-medium',
                  getBudgetTimeStatus?.status === 'ended'
                    ? 'bg-muted text-muted-foreground'
                    : getBudgetTimeStatus?.status === 'upcoming'
                      ? 'bg-blue-500/10 text-blue-400'
                      : 'bg-success-text/10 text-success-text',
                ]"
              >
                {{ getBudgetTimeStatus?.text }}
              </span>
            </div>
            <div v-if="transactionDateRange" class="text-muted-foreground mt-1 flex items-center gap-1.5 text-sm">
              <CalendarIcon class="size-3.5" />
              <span v-if="transactionDateRange.first && transactionDateRange.last">
                {{ transactionDateRange.first }}
                <ArrowRightIcon class="inline size-3" />
                {{ transactionDateRange.last }}
              </span>
              <span v-else-if="transactionDateRange.first">{{ transactionDateRange.first }}</span>
              <span v-else-if="transactionDateRange.last">{{ transactionDateRange.last }}</span>
            </div>
            <p v-else class="text-muted-foreground mt-1 text-sm">{{ $t('budgets.categoryBudget.noTransactions') }}</p>
          </div>
        </div>

        <!-- Action Buttons -->
        <div class="flex items-center gap-2">
          <Button variant="outline" size="sm" @click="handleToggleArchive">
            <component :is="isBudgetArchived ? ArchiveRestoreIcon : ArchiveIcon" class="mr-2 size-4" />
            {{ isBudgetArchived ? $t('budgets.list.unarchive') : $t('budgets.list.archive') }}
          </Button>

          <ResponsiveDialog v-model:open="isEditDialogOpen">
            <template #trigger>
              <Button variant="outline" size="sm">
                <PencilIcon class="mr-2 size-4" />
                {{ $t('budgets.categoryBudget.edit') }}
              </Button>
            </template>
            <template #title>{{ $t('budgets.categoryBudget.editTitle') }}</template>
            <CategoryBudgetEditForm
              v-if="isEditDialogOpen"
              :budget="budgetData"
              :is-loading="isBudgetDataUpdating"
              @save="handleSaveFromDialog"
            />
          </ResponsiveDialog>

          <AlertDialog
            :title="$t('budgets.list.deleteDialog.title')"
            accept-variant="destructive"
            @accept="handleDeleteBudget"
          >
            <template #description>
              {{ $t('budgets.list.deleteDialog.description') }}
            </template>
            <template #trigger>
              <Button variant="destructive" size="sm">
                <Trash2Icon class="size-4" />
              </Button>
            </template>
          </AlertDialog>
        </div>
      </div>
    </div>

    <!-- Tracked Categories Card -->
    <Card class="mb-6 p-4">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <TagIcon class="text-muted-foreground size-4" />
          <span class="text-sm font-medium">{{ $t('budgets.categoryBudget.trackedCategories') }}</span>
        </div>
        <span class="text-muted-foreground text-sm">
          {{ $t('budgets.categoryBudget.categoriesCount', { count: budgetData.categories?.length || 0 }) }}
        </span>
      </div>
      <div
        class="relative mt-3"
        :class="{ 'max-h-16 overflow-hidden': !isCategoriesExpanded && budgetData.categories?.length > 6 }"
      >
        <div class="flex flex-wrap gap-2">
          <span
            v-for="category in budgetData.categories"
            :key="category.id"
            class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium text-white"
            :style="{ backgroundColor: category.color }"
          >
            {{ category.name }}
          </span>
        </div>
        <!-- Gradient overlay when collapsed -->
        <div
          v-if="!isCategoriesExpanded && budgetData.categories?.length > 6"
          class="from-card pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-linear-to-t to-transparent"
        />
      </div>
      <button
        v-if="budgetData.categories?.length > 6"
        type="button"
        class="text-muted-foreground hover:text-foreground mt-2 flex items-center gap-1 text-xs transition-colors"
        @click="isCategoriesExpanded = !isCategoriesExpanded"
      >
        <template v-if="isCategoriesExpanded">
          <ChevronUpIcon class="size-3" />
          {{ $t('budgets.categoryBudget.showLess') }}
        </template>
        <template v-else>
          <ChevronDownIcon class="size-3" />
          {{ $t('budgets.categoryBudget.showMore') }}
        </template>
      </button>
      <p class="text-muted-foreground mt-3 text-xs">
        {{ $t('budgets.categoryBudget.autoTrackedInfo') }}
      </p>
    </Card>

    <BudgetStatsCards :stats="stats" />

    <BudgetUtilizationBar
      v-if="budgetData.limitAmount"
      :limit-amount="budgetData.limitAmount"
      :stats="stats"
      :utilization-color="utilizationColor"
      :utilization-text-color="utilizationTextColor"
    />

    <!-- Category Breakdown -->
    <Card v-if="categoryBreakdown.length > 0" class="mb-6 p-4">
      <h3 class="mb-4 font-medium">{{ $t('budgets.categoryBudget.categoryBreakdown') }}</h3>
      <div class="space-y-3">
        <div v-for="item in categoryBreakdown" :key="item.category?.id" class="flex items-center gap-3">
          <div class="size-3 shrink-0 rounded-full" :style="{ backgroundColor: item.category?.color || '#888' }" />
          <span class="flex-1 truncate text-sm">{{ item.category?.name }}</span>
          <span class="text-muted-foreground text-sm font-medium tabular-nums">
            {{ formatBaseCurrency(item.amount) }}
          </span>
          <span class="text-muted-foreground w-12 text-right text-xs">
            {{ Math.round((item.amount / totalBreakdownAmount) * 100) }}%
          </span>
        </div>
      </div>
    </Card>

    <!-- Transactions Section -->
    <div>
      <div class="mb-4">
        <h2 class="text-lg font-medium">{{ $t('budgets.categoryBudget.transactionsTitle') }}</h2>
        <p class="text-muted-foreground text-sm">
          {{ $t('budgets.categoryBudget.transactionsCount', { count: stats.transactionsCount }) }}
        </p>
      </div>

      <Card class="overflow-clip">
        <div class="p-3 @md:p-4">
          <template v-if="isLoadingTransactions">
            <div class="flex items-center justify-center py-12">
              <div class="text-muted-foreground text-sm">{{ t('pages.budgetDetails.loading') }}</div>
            </div>
          </template>
          <template v-else-if="transactions.length > 0">
            <div class="space-y-1">
              <div
                v-for="tx in transactions"
                :key="`${tx.id}-${tx.effectiveCategory?.id}`"
                class="hover:bg-muted/50 flex items-center gap-3 rounded-lg p-2 transition-colors"
              >
                <div
                  v-if="tx.effectiveCategory"
                  class="size-8 shrink-0 rounded-full"
                  :style="{ backgroundColor: tx.effectiveCategory.color }"
                />
                <div v-else class="bg-muted size-8 shrink-0 rounded-full" />

                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2">
                    <span v-if="tx.effectiveCategory" class="truncate text-sm font-medium">
                      {{ tx.effectiveCategory.name }}
                    </span>
                    <span v-else class="text-muted-foreground truncate text-sm">
                      {{ t('pages.budgetDetails.uncategorized') }}
                    </span>
                  </div>
                  <div class="text-muted-foreground flex items-center gap-2 text-xs">
                    <span>{{ formatTransactionDate(tx.time) }}</span>
                    <span v-if="tx.note" class="truncate">{{ tx.note }}</span>
                  </div>
                </div>

                <div class="text-right">
                  <span
                    class="text-sm font-medium tabular-nums"
                    :class="tx.transactionType === 'expense' ? 'text-app-expense-color' : 'text-success-text'"
                  >
                    {{ tx.transactionType === 'expense' ? '-' : '+'
                    }}{{ formatBaseCurrency(tx.effectiveRefAmount || tx.refAmount) }}
                  </span>
                </div>
              </div>
            </div>

            <div v-if="hasMoreTransactions" class="mt-4 flex justify-center">
              <Button variant="outline" size="sm" :disabled="isFetchingTransactions" @click="loadMoreTransactions">
                {{ $t('budgets.categoryBudget.loadMore') }}
              </Button>
            </div>
          </template>
          <template v-else>
            <!-- Empty State -->
            <div class="flex flex-col items-center justify-center py-12 text-center">
              <div class="bg-muted mb-4 flex size-16 items-center justify-center rounded-full">
                <LayersIcon class="text-muted-foreground size-8" />
              </div>
              <h3 class="mb-1 font-medium">{{ $t('budgets.categoryBudget.noTransactions') }}</h3>
              <p class="text-muted-foreground max-w-sm text-sm">
                {{ $t('budgets.categoryBudget.noTransactionsDescription') }}
              </p>
            </div>
          </template>
        </div>
      </Card>
    </div>
  </div>

  <!-- Loading State -->
  <BudgetDetailSkeleton v-else />
</template>
