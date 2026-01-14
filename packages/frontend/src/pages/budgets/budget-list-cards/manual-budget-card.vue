<script setup lang="ts">
import { Card } from '@/components/lib/ui/card';
import { useFormatCurrency } from '@/composable';
import { BudgetModel } from '@bt/shared/types';
import { format } from 'date-fns';
import { ArrowRightIcon, CalendarIcon, WalletIcon } from 'lucide-vue-next';

import BudgetStatsSkeleton from '../budget-stats-skeleton.vue';
import BudgetCardDropdown from './shared/budget-card-dropdown.vue';
import BudgetCardStats from './shared/budget-card-stats.vue';
import BudgetCardUtilization from './shared/budget-card-utilization.vue';

defineProps<{
  budget: BudgetModel;
  stats: {
    actualIncome: number;
    actualExpense: number;
    balance: number;
    utilizationRate: number;
    transactionsCount: number;
    firstTransactionDate: string | null;
    lastTransactionDate: string | null;
  } | null;
  isStatsLoading: boolean;
  timeStatus: { status: 'ended' | 'upcoming' | 'active'; text: string } | null;
}>();

const emit = defineEmits<{
  edit: [];
  delete: [];
}>();

const { formatBaseCurrency } = useFormatCurrency();

const formatDate = (date: Date | string | undefined | null) => {
  if (!date) return null;
  return format(new Date(date), 'MMM d, yyyy');
};
</script>

<template>
  <Card class="group relative flex cursor-pointer flex-col overflow-hidden transition-all duration-200 hover:border-white/20 hover:bg-white/2">
    <!-- Status Banner -->
    <div
      :class="[
        'flex items-center justify-center py-1.5 text-xs font-medium',
        !timeStatus
          ? 'bg-muted/50 text-muted-foreground/70'
          : timeStatus.status === 'ended'
            ? 'bg-muted text-muted-foreground'
            : timeStatus.status === 'upcoming'
              ? 'bg-blue-500/15 text-blue-400'
              : 'bg-success-text/15 text-success-text',
      ]"
    >
      {{ timeStatus?.text || $t('budgets.list.noTimePeriod') }}
    </div>

    <div class="relative flex flex-1 flex-col p-4">
      <BudgetCardDropdown :budget-id="budget.id" @edit="emit('edit')" @delete="emit('delete')" />
      <!-- Header -->
      <div class="mb-4 flex items-center gap-3">
        <div class="bg-muted flex size-10 shrink-0 items-center justify-center rounded-lg">
          <WalletIcon class="text-muted-foreground size-5" />
        </div>
        <div class="mt-auto min-w-0 flex-1">
          <h3 class="truncate pr-8 font-medium">{{ budget.name }}</h3>
          <div class="text-muted-foreground flex items-center gap-2 text-sm">
            <span v-if="budget.limitAmount">{{
              $t('budgets.list.limitLabel', { amount: formatBaseCurrency(budget.limitAmount) })
            }}</span>
            <template v-if="isStatsLoading">
              <span v-if="budget.limitAmount">·</span>
              <span class="bg-muted inline-block h-4 w-16 animate-pulse rounded" />
            </template>
            <template v-else>
              <span v-if="budget.limitAmount && stats?.transactionsCount">·</span>
              <span v-if="stats?.transactionsCount">
                {{ $t('budgets.list.transactionsCount', { count: stats.transactionsCount }) }}
              </span>
              <span v-else class="text-muted-foreground/60 italic">
                {{ $t('budgets.list.noTransactions') }}
              </span>
            </template>
          </div>
        </div>
      </div>

      <!-- Transaction Date Range (based on actual transactions) -->
      <div class="text-muted-foreground mb-3 flex items-center gap-2 text-xs">
        <template v-if="isStatsLoading">
          <div class="flex items-center gap-1.5">
            <CalendarIcon class="size-3.5" />
            <span class="bg-muted inline-block h-3 w-24 animate-pulse rounded" />
          </div>
        </template>
        <template v-else-if="stats?.firstTransactionDate || stats?.lastTransactionDate">
          <div class="flex items-center gap-1.5">
            <CalendarIcon class="size-3.5" />
            <span v-if="stats.firstTransactionDate && stats.lastTransactionDate">
              {{ formatDate(stats.firstTransactionDate) }}
              <ArrowRightIcon class="inline size-3" />
              {{ formatDate(stats.lastTransactionDate) }}
            </span>
            <span v-else-if="stats.firstTransactionDate">
              {{ formatDate(stats.firstTransactionDate) }}
            </span>
            <span v-else-if="stats.lastTransactionDate">
              {{ formatDate(stats.lastTransactionDate) }}
            </span>
          </div>
        </template>
        <template v-else>
          <div class="flex items-center gap-1.5">
            <CalendarIcon class="size-3.5" />
            <span class="text-muted-foreground/60 italic">{{ $t('budgets.list.noTransactions') }}</span>
          </div>
        </template>
      </div>

      <!-- Stats -->
      <BudgetStatsSkeleton v-if="isStatsLoading" :show-utilization="!!budget.limitAmount" />
      <template v-else>
        <BudgetCardStats
          :income="stats?.actualIncome ?? 0"
          :expense="stats?.actualExpense ?? 0"
          :balance="stats?.balance ?? 0"
        />
        <BudgetCardUtilization v-if="budget.limitAmount" :utilization-rate="stats?.utilizationRate ?? 0" />
      </template>
    </div>
  </Card>
</template>
