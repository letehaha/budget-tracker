<script setup lang="ts">
import { editBudget, loadBudgetById, loadBudgetStats } from '@/api/budgets';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import ResponsiveDialog from '@/components/common/responsive-dialog.vue';
import DateField from '@/components/fields/date-field.vue';
import InputField from '@/components/fields/input-field.vue';
import { buttonVariants } from '@/components/lib/ui/button';
import Button from '@/components/lib/ui/button/Button.vue';
import Card from '@/components/lib/ui/card/Card.vue';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/lib/ui/collapsible';
import { useNotificationCenter } from '@/components/notification-center';
import { useFormatCurrency } from '@/composable';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { differenceInDays, format, isPast, isWithinInterval } from 'date-fns';
import { cloneDeep } from 'lodash-es';
import {
  ArrowRightIcon,
  CalendarIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  SettingsIcon,
  TrendingDownIcon,
  TrendingUpIcon,
  WalletIcon,
} from 'lucide-vue-next';
import { computed, ref, watchEffect } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';

import BudgetDetailSkeleton from './budget-detail-skeleton.vue';
import TransactionsList from './transactions-list.vue';

const route = useRoute();
const queryClient = useQueryClient();
const { formatBaseCurrency } = useFormatCurrency();
const { addSuccessNotification } = useNotificationCenter();
const { t } = useI18n();
const budgetData = ref();
const currentBudgetId = ref<number>(Number(route.params.id));
const isSettingsOpen = ref(false);
const isSettingsDialogOpen = ref(false);

const { data: budgetStats } = useQuery({
  queryFn: () => loadBudgetStats({ budgetId: currentBudgetId.value }),
  queryKey: [...VUE_QUERY_CACHE_KEYS.budgetStats, currentBudgetId],
  staleTime: 30_000,
});

const stats = computed(() => ({
  expenses: budgetStats.value?.summary.actualExpense || 0,
  income: budgetStats.value?.summary.actualIncome || 0,
  balance: budgetStats.value?.summary.balance || 0,
  utilizationRate: budgetStats.value?.summary.utilizationRate ?? null,
  transactionsCount: budgetStats.value?.summary.transactionsCount || 0,
  firstTransactionDate: budgetStats.value?.summary.firstTransactionDate || null,
  lastTransactionDate: budgetStats.value?.summary.lastTransactionDate || null,
}));

const { data: budgetItem, isLoading } = useQuery({
  queryFn: () => loadBudgetById(currentBudgetId.value),
  queryKey: [VUE_QUERY_CACHE_KEYS.budgetsListItem, currentBudgetId.value],
  staleTime: Infinity,
});

const { mutate, isPending: isBudgetDataUpdating } = useMutation({
  mutationFn: editBudget,
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.budgetsList });
    queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.budgetStats });
  },
});

const saveBudgetChanges = async () => {
  await mutate({
    budgetId: currentBudgetId.value,
    payload: {
      name: budgetData.value.name,
      limitAmount: budgetData.value.limitAmount,
    },
  });
  addSuccessNotification(t('budgets.list.updateSuccess'));
};

const handleSaveFromDialog = async () => {
  await saveBudgetChanges();
  isSettingsDialogOpen.value = false;
};

watchEffect(() => {
  if (!isLoading.value && budgetItem.value) {
    budgetData.value = cloneDeep(budgetItem.value);
  }
});

// Date formatting helpers
const formatDate = (date: Date | string | null | undefined) => {
  if (!date) return null;
  const parsedDate = new Date(date);
  // Check for invalid date (like 1970 epoch)
  if (isNaN(parsedDate.getTime()) || parsedDate.getFullYear() < 2000) return null;
  return format(parsedDate, 'MMM d, yyyy');
};

// Transaction date range from stats (actual transactions linked to this budget)
const transactionDateRange = computed(() => {
  const first = stats.value.firstTransactionDate;
  const last = stats.value.lastTransactionDate;
  if (!first && !last) return null;
  return {
    first: first ? formatDate(first) : null,
    last: last ? formatDate(last) : null,
  };
});

// Time status badge logic (same as budget-list)
const getBudgetTimeStatus = computed(() => {
  if (!budgetData.value) return null;
  const startDate = budgetData.value.startDate ? new Date(budgetData.value.startDate) : null;
  const endDate = budgetData.value.endDate ? new Date(budgetData.value.endDate) : null;

  // Check for invalid dates
  if (startDate && (isNaN(startDate.getTime()) || startDate.getFullYear() < 2000)) return null;
  if (endDate && (isNaN(endDate.getTime()) || endDate.getFullYear() < 2000)) return null;

  if (!startDate && !endDate) return null;

  const now = new Date();

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
});

const utilizationColor = computed(() => {
  const rate = stats.value.utilizationRate;
  if (rate === null) return 'bg-muted-foreground';
  if (rate > 90) return 'bg-app-expense-color';
  if (rate > 70) return 'bg-warning-text';
  return 'bg-success-text';
});

const utilizationTextColor = computed(() => {
  const rate = stats.value.utilizationRate;
  if (rate === null) return 'text-muted-foreground';
  if (rate > 90) return 'text-app-expense-color';
  if (rate > 70) return 'text-warning-text';
  return 'text-success-text';
});
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
        Back to Budgets
      </router-link>

      <!-- Hero Header -->
      <div class="flex flex-col gap-4 @md:flex-row @md:items-center @md:justify-between">
        <div class="flex items-center gap-4">
          <div class="bg-muted flex size-12 shrink-0 items-center justify-center rounded-xl">
            <WalletIcon class="text-muted-foreground size-6" />
          </div>
          <div>
            <div class="flex items-center gap-3">
              <h1 class="text-2xl font-semibold tracking-tight">{{ budgetData.name }}</h1>
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
            <!-- Transaction Date Range (based on actual linked transactions) -->
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
            <p v-else class="text-muted-foreground mt-1 text-sm">No transactions yet</p>
          </div>
        </div>

        <!-- Settings Toggle (Desktop: Collapsible, Mobile: Dialog) -->
        <Button variant="outline" size="sm" class="hidden @md:flex" @click="isSettingsOpen = !isSettingsOpen">
          <SettingsIcon class="mr-2 size-4" />
          Settings
        </Button>
        <ResponsiveDialog v-model:open="isSettingsDialogOpen">
          <template #trigger>
            <Button variant="outline" size="sm" class="@md:hidden">
              <SettingsIcon class="mr-2 size-4" />
              Settings
            </Button>
          </template>
          <template #title>{{ $t('budgets.settings.title') }}</template>
          <div class="grid gap-4">
            <InputField
              v-model="budgetData.name"
              :label="$t('budgets.settings.nameLabel')"
              :placeholder="$t('budgets.settings.namePlaceholder')"
              class="w-full"
              :disabled="isBudgetDataUpdating"
            />
            <InputField
              v-model="budgetData.limitAmount"
              :label="$t('budgets.settings.limitLabel')"
              :placeholder="$t('budgets.settings.limitPlaceholder')"
              type="number"
              class="w-full"
              :disabled="isBudgetDataUpdating"
            />
            <!-- Read-only date display for mobile -->
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="text-muted-foreground mb-1.5 block text-sm font-medium">{{
                  $t('budgets.settings.startDateLabel')
                }}</label>
                <div
                  class="border-input bg-muted/50 text-muted-foreground flex h-10 items-center rounded-md border px-3 text-sm"
                >
                  {{ formatDate(budgetData.startDate) || 'Not set' }}
                </div>
              </div>
              <div>
                <label class="text-muted-foreground mb-1.5 block text-sm font-medium">{{
                  $t('budgets.settings.endDateLabel')
                }}</label>
                <div
                  class="border-input bg-muted/50 text-muted-foreground flex h-10 items-center rounded-md border px-3 text-sm"
                >
                  {{ formatDate(budgetData.endDate) || 'Not set' }}
                </div>
              </div>
            </div>
            <Button @click="handleSaveFromDialog" :disabled="isBudgetDataUpdating" class="w-full">
              <template v-if="isBudgetDataUpdating">Saving...</template>
              <template v-else>Save Changes</template>
            </Button>
          </div>
        </ResponsiveDialog>
      </div>
    </div>

    <!-- Stats Cards -->
    <div class="mb-6 grid grid-cols-1 gap-3 @3xl:grid-cols-3 @3xl:gap-4">
      <!-- Income Card -->
      <Card class="p-4">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-muted-foreground text-sm font-medium">Income</p>
            <p class="text-success-text mt-1 text-2xl font-semibold tabular-nums">
              {{ formatBaseCurrency(stats.income) }}
            </p>
          </div>
          <div class="bg-success-text/10 flex size-10 items-center justify-center rounded-full">
            <TrendingUpIcon class="text-success-text size-5" />
          </div>
        </div>
      </Card>

      <!-- Expenses Card -->
      <Card class="p-4">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-muted-foreground text-sm font-medium">Expenses</p>
            <p class="text-app-expense-color mt-1 text-2xl font-semibold tabular-nums">
              {{ formatBaseCurrency(stats.expenses) }}
            </p>
          </div>
          <div class="bg-app-expense-color/10 flex size-10 items-center justify-center rounded-full">
            <TrendingDownIcon class="text-app-expense-color size-5" />
          </div>
        </div>
      </Card>

      <!-- Net Balance Card -->
      <Card class="p-4">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-muted-foreground text-sm font-medium">Net Balance</p>
            <p
              class="mt-1 text-2xl font-semibold tabular-nums"
              :class="stats.balance >= 0 ? 'text-success-text' : 'text-app-expense-color'"
            >
              {{ formatBaseCurrency(stats.balance) }}
            </p>
          </div>
          <div
            class="flex size-10 items-center justify-center rounded-full"
            :class="stats.balance >= 0 ? 'bg-success-text/10' : 'bg-app-expense-color/10'"
          >
            <WalletIcon class="size-5" :class="stats.balance >= 0 ? 'text-success-text' : 'text-app-expense-color'" />
          </div>
        </div>
      </Card>
    </div>

    <!-- Utilization Progress (only if limit is set) -->
    <Card v-if="budgetData.limitAmount" class="mb-6 p-4">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-muted-foreground text-sm font-medium">Budget Utilization</p>
          <p class="mt-1 text-sm">
            <span class="font-medium">{{ formatBaseCurrency(stats.expenses) }}</span>
            <span class="text-muted-foreground"> of </span>
            <span class="font-medium">{{ formatBaseCurrency(budgetData.limitAmount) }}</span>
            <span class="text-muted-foreground"> limit</span>
          </p>
        </div>
        <span :class="['text-2xl font-semibold tabular-nums', utilizationTextColor]">
          {{ stats.utilizationRate !== null ? `${Math.round(stats.utilizationRate)}%` : 'N/A' }}
        </span>
      </div>
      <div class="bg-muted mt-3 h-2 overflow-hidden rounded-full">
        <div
          class="h-full rounded-full transition-all duration-500"
          :class="utilizationColor"
          :style="{ width: `${Math.min(stats.utilizationRate ?? 0, 100)}%` }"
        />
      </div>
    </Card>

    <!-- Collapsible Settings Section (Desktop only) -->
    <Collapsible v-model:open="isSettingsOpen" class="mb-6 hidden @md:block">
      <CollapsibleContent>
        <Card class="p-4">
          <div class="mb-4 flex items-center justify-between">
            <h3 class="font-medium">{{ $t('budgets.settings.title') }}</h3>
            <CollapsibleTrigger as-child>
              <Button variant="ghost" size="sm">
                <ChevronDownIcon class="size-4" />
              </Button>
            </CollapsibleTrigger>
          </div>

          <div class="grid gap-4 @sm:grid-cols-2">
            <InputField
              v-model="budgetData.name"
              :label="$t('budgets.settings.nameLabel')"
              :placeholder="$t('budgets.settings.namePlaceholder')"
              class="w-full"
              :disabled="isBudgetDataUpdating"
            />

            <InputField
              v-model="budgetData.limitAmount"
              :label="$t('budgets.settings.limitLabel')"
              :placeholder="$t('budgets.settings.limitPlaceholder')"
              type="number"
              class="w-full"
              :disabled="isBudgetDataUpdating"
            />

            <DateField
              :model-value="budgetData.startDate ? new Date(budgetData.startDate) : undefined"
              disabled
              :calendar-mode="'date'"
              :label="$t('budgets.settings.startDateLabel')"
            />
            <DateField
              :model-value="budgetData.endDate ? new Date(budgetData.endDate) : undefined"
              disabled
              :label="$t('budgets.settings.endDateLabel')"
            />
          </div>

          <div class="mt-4 flex justify-end">
            <Button @click="saveBudgetChanges" :disabled="isBudgetDataUpdating">
              <template v-if="isBudgetDataUpdating">Saving...</template>
              <template v-else>Save Changes</template>
            </Button>
          </div>
        </Card>
      </CollapsibleContent>
    </Collapsible>

    <!-- Transactions Section -->
    <div>
      <div class="mb-4 flex items-center justify-between">
        <div>
          <h2 class="text-lg font-medium">Transactions</h2>
          <p class="text-muted-foreground text-sm">
            {{ stats.transactionsCount }} transaction{{ stats.transactionsCount !== 1 ? 's' : '' }} linked to this
            budget
          </p>
        </div>
      </div>

      <TransactionsList :budgetId="currentBudgetId" :isBudgetDataUpdating="isBudgetDataUpdating" />
    </div>
  </div>

  <!-- Loading State -->
  <BudgetDetailSkeleton v-else />
</template>
