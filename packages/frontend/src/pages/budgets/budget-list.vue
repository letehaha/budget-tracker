<script setup lang="ts">
import { deleteBudget as deleteBudgetApi, loadBudgetStats } from '@/api';
import { loadSystemBudgets } from '@/api/budgets';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import { AlertDialog } from '@/components/common';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/common/dropdown-menu';
import Button from '@/components/lib/ui/button/Button.vue';
import { Card } from '@/components/lib/ui/card';
import { useNotificationCenter } from '@/components/notification-center';

import BudgetCardSkeleton from './budget-card-skeleton.vue';
import BudgetStatsSkeleton from './budget-stats-skeleton.vue';
import { useFormatCurrency } from '@/composable';
import { ROUTES_NAMES } from '@/routes';
import { BudgetModel } from '@bt/shared/types';
import { useQueries, useQuery, useQueryClient } from '@tanstack/vue-query';
import { differenceInDays, format, isPast, isWithinInterval } from 'date-fns';
import { ArrowRightIcon, CalendarIcon, MoreVerticalIcon, PencilIcon, Trash2Icon, WalletIcon } from 'lucide-vue-next';
import { computed } from 'vue';
import { useRouter } from 'vue-router';

const { addErrorNotification, addSuccessNotification } = useNotificationCenter();
const router = useRouter();
const queryClient = useQueryClient();
const { formatBaseCurrency } = useFormatCurrency();

const {
  data: budgetsList,
  isPlaceholderData: isBudgetsListPlaceholder,
} = useQuery({
  queryFn: () => loadSystemBudgets(),
  queryKey: VUE_QUERY_CACHE_KEYS.budgetsList,
  staleTime: Infinity,
  placeholderData: [],
});

// Show loading state when showing placeholder data (initial load)
const isBudgetsListLoading = computed(() => isBudgetsListPlaceholder.value);

// Load stats for all budgets
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
  // Show loading if: no query, query pending, query fetching without data, or data undefined
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
    addSuccessNotification('Budget deleted successfully!');
  } catch {
    addErrorNotification('Unexpected error!');
  }
};

const formatDate = (date: Date | string | undefined | null) => {
  if (!date) return null;
  return format(new Date(date), 'MMM d, yyyy');
};

// Get transaction date range from stats
const getTransactionDateRange = (budgetId: number) => {
  const stats = getBudgetStats(budgetId);
  if (!stats) return null;
  const first = stats.summary?.firstTransactionDate;
  const last = stats.summary?.lastTransactionDate;
  if (!first && !last) return null;
  return {
    first: first ? formatDate(first) : null,
    last: last ? formatDate(last) : null,
  };
};

const getBudgetTimeStatus = (budget: BudgetModel) => {
  if (!budget.startDate && !budget.endDate) return null;

  const now = new Date();
  const startDate = budget.startDate ? new Date(budget.startDate) : null;
  const endDate = budget.endDate ? new Date(budget.endDate) : null;

  // Budget has ended
  if (endDate && isPast(endDate)) {
    return { status: 'ended' as const, text: 'Ended' };
  }

  // Budget is active (has both dates and we're within the interval)
  if (startDate && endDate && isWithinInterval(now, { start: startDate, end: endDate })) {
    const daysLeft = differenceInDays(endDate, now);
    if (daysLeft === 0) return { status: 'active' as const, text: 'Last day' };
    if (daysLeft === 1) return { status: 'active' as const, text: '1 day left' };
    return { status: 'active' as const, text: `${daysLeft} days left` };
  }

  // Budget hasn't started yet
  if (startDate && !isPast(startDate)) {
    const daysUntil = differenceInDays(startDate, now);
    if (daysUntil === 0) return { status: 'upcoming' as const, text: 'Starts today' };
    if (daysUntil === 1) return { status: 'upcoming' as const, text: 'Starts tomorrow' };
    return { status: 'upcoming' as const, text: `Starts in ${daysUntil} days` };
  }

  // Only end date set and it's in the future
  if (endDate && !isPast(endDate)) {
    const daysLeft = differenceInDays(endDate, now);
    if (daysLeft === 0) return { status: 'active' as const, text: 'Last day' };
    if (daysLeft === 1) return { status: 'active' as const, text: '1 day left' };
    return { status: 'active' as const, text: `${daysLeft} days left` };
  }

  return null;
};
</script>

<template>
  <div>
    <!-- Loading Skeleton -->
    <BudgetCardSkeleton v-if="isBudgetsListLoading" />

    <template v-else-if="budgetsList.length">
      <!-- Budget Cards Grid -->
      <div class="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
        <Card
          v-for="budget in budgetsList"
          :key="budget.id"
          class="group relative cursor-pointer transition-all duration-200 hover:border-white/20 hover:bg-white/[0.02]"
          @click="navigateToBudget({ budgetId: budget.id })"
        >
          <!-- Dropdown Menu -->
          <div class="absolute top-3 right-3 z-10">
            <DropdownMenu>
              <DropdownMenuTrigger as-child>
                <Button variant="ghost" size="icon" class="size-8" @click.stop>
                  <MoreVerticalIcon class="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem @click.stop="navigateToBudget({ budgetId: budget.id })">
                  <PencilIcon class="mr-2 size-4" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <AlertDialog
                  title="Do you want to delete this budget?"
                  accept-variant="destructive"
                  @accept="deleteBudget({ budgetId: budget.id })"
                >
                  <template #description>
                    By clicking "Accept," all associated transactions will be unlinked from the budget but will remain
                    in the system.
                  </template>
                  <template #trigger>
                    <DropdownMenuItem
                      class="text-destructive-text focus:bg-destructive-text/10 focus:text-destructive-text"
                      @select.prevent
                      @click.stop
                    >
                      <Trash2Icon class="mr-2 size-4" />
                      Delete
                    </DropdownMenuItem>
                  </template>
                </AlertDialog>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <!-- Card Content -->
          <div class="flex h-full flex-col p-4">
            <!-- Header -->
            <div class="mb-4 flex items-center gap-3">
              <div class="bg-muted flex size-10 shrink-0 items-center justify-center rounded-lg">
                <WalletIcon class="text-muted-foreground size-5" />
              </div>
              <div class="mt-auto min-w-0 flex-1">
                <h3 class="truncate pr-8 font-medium">{{ budget.name }}</h3>
                <div class="text-muted-foreground flex items-center gap-2 text-sm">
                  <span v-if="budget.limitAmount">Limit: {{ formatBaseCurrency(budget.limitAmount) }}</span>
                  <template v-if="isBudgetStatsLoading(budget.id)">
                    <span v-if="budget.limitAmount">·</span>
                    <span class="bg-muted inline-block h-4 w-16 animate-pulse rounded" />
                  </template>
                  <template v-else>
                    <span v-if="budget.limitAmount && getBudgetStats(budget.id)?.summary?.transactionsCount">·</span>
                    <span v-if="getBudgetStats(budget.id)?.summary?.transactionsCount">
                      {{ getBudgetStats(budget.id)?.summary?.transactionsCount }} transactions
                    </span>
                    <span v-else class="text-muted-foreground/60 italic">
                      No transactions yet
                    </span>
                  </template>
                </div>
              </div>
            </div>

            <!-- Transaction Date Range (based on actual transactions) -->
            <div class="text-muted-foreground mb-3 flex items-center justify-between text-xs">
              <template v-if="isBudgetStatsLoading(budget.id)">
                <div class="flex items-center gap-1.5">
                  <CalendarIcon class="size-3.5" />
                  <span class="bg-muted inline-block h-3 w-24 animate-pulse rounded" />
                </div>
              </template>
              <template v-else-if="getTransactionDateRange(budget.id)">
                <div class="flex items-center gap-1.5">
                  <CalendarIcon class="size-3.5" />
                  <span v-if="getTransactionDateRange(budget.id)?.first && getTransactionDateRange(budget.id)?.last">
                    {{ getTransactionDateRange(budget.id)?.first }}
                    <ArrowRightIcon class="inline size-3" />
                    {{ getTransactionDateRange(budget.id)?.last }}
                  </span>
                  <span v-else-if="getTransactionDateRange(budget.id)?.first">
                    {{ getTransactionDateRange(budget.id)?.first }}
                  </span>
                  <span v-else-if="getTransactionDateRange(budget.id)?.last">
                    {{ getTransactionDateRange(budget.id)?.last }}
                  </span>
                </div>
              </template>
              <template v-else>
                <div class="flex items-center gap-1.5">
                  <CalendarIcon class="size-3.5" />
                  <span class="text-muted-foreground/60 italic">No transactions yet</span>
                </div>
              </template>
              <span
                v-if="getBudgetTimeStatus(budget)"
                :class="[
                  'rounded-full px-2 py-0.5 text-[10px] font-medium',
                  getBudgetTimeStatus(budget)?.status === 'ended'
                    ? 'bg-muted text-muted-foreground'
                    : getBudgetTimeStatus(budget)?.status === 'upcoming'
                      ? 'bg-blue-500/10 text-blue-400'
                      : 'bg-success-text/10 text-success-text',
                ]"
              >
                {{ getBudgetTimeStatus(budget)?.text }}
              </span>
            </div>

            <!-- Stats -->
            <BudgetStatsSkeleton
              v-if="isBudgetStatsLoading(budget.id)"
              :show-utilization="!!budget.limitAmount"
            />
            <template v-else>
              <div class="border-border/50 mt-auto grid grid-cols-3 gap-2 border-t pt-3">
                <div>
                  <div class="text-muted-foreground text-[10px] tracking-wider uppercase">Income</div>
                  <div class="text-success-text text-sm font-medium tabular-nums">
                    {{ formatBaseCurrency(getBudgetStats(budget.id)?.summary?.actualIncome ?? 0) }}
                  </div>
                </div>
                <div>
                  <div class="text-muted-foreground text-[10px] tracking-wider uppercase">Expenses</div>
                  <div class="text-app-expense-color text-sm font-medium tabular-nums">
                    {{ formatBaseCurrency(getBudgetStats(budget.id)?.summary?.actualExpense ?? 0) }}
                  </div>
                </div>
                <div>
                  <div class="text-muted-foreground text-[10px] tracking-wider uppercase">Net</div>
                  <div
                    class="text-sm font-medium tabular-nums"
                    :class="
                      (getBudgetStats(budget.id)?.summary?.balance ?? 0) >= 0
                        ? 'text-success-text'
                        : 'text-app-expense-color'
                    "
                  >
                    {{ formatBaseCurrency(getBudgetStats(budget.id)?.summary?.balance ?? 0) }}
                  </div>
                </div>
              </div>

              <!-- Utilization bar (only if limit is set) -->
              <div v-if="budget.limitAmount" class="mt-3">
                <div class="mb-1 flex items-center justify-between text-xs">
                  <span class="text-muted-foreground">Used</span>
                  <span
                    :class="[
                      'font-medium tabular-nums',
                      (getBudgetStats(budget.id)?.summary?.utilizationRate ?? 0) > 90
                        ? 'text-app-expense-color'
                        : (getBudgetStats(budget.id)?.summary?.utilizationRate ?? 0) > 70
                          ? 'text-warning-text'
                          : 'text-success-text',
                    ]"
                  >
                    {{ Math.round(getBudgetStats(budget.id)?.summary?.utilizationRate ?? 0) }}%
                  </span>
                </div>
                <div class="bg-muted h-1.5 overflow-hidden rounded-full">
                  <div
                    class="h-full rounded-full transition-all duration-300"
                    :class="[
                      (getBudgetStats(budget.id)?.summary?.utilizationRate ?? 0) > 90
                        ? 'bg-app-expense-color'
                        : (getBudgetStats(budget.id)?.summary?.utilizationRate ?? 0) > 70
                          ? 'bg-warning-text'
                          : 'bg-success-text',
                    ]"
                    :style="{ width: `${Math.min(getBudgetStats(budget.id)?.summary?.utilizationRate ?? 0, 100)}%` }"
                  />
                </div>
              </div>
            </template>
          </div>
        </Card>
      </div>
    </template>

    <template v-else>
      <div class="flex flex-col items-center justify-center py-12 text-center">
        <div class="bg-muted mb-4 flex size-16 items-center justify-center rounded-full">
          <WalletIcon class="text-muted-foreground size-8" />
        </div>
        <h3 class="mb-1 font-medium">No budgets yet</h3>
        <p class="text-muted-foreground max-w-sm text-sm">
          Create a budget to start tracking your spending or monitoring specific events.
        </p>
      </div>
    </template>
  </div>
</template>
