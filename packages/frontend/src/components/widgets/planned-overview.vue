<script lang="ts" setup>
import TransactionsList from '@/components/transactions-list/transactions-list.vue';
import { usePendingPlannedTransactions } from '@/composable/data-queries/planned-transactions';
import { useFormatCurrency } from '@/composable/formatters';
import { useAnimatedNumber } from '@/composable/use-animated-number';
import { useBaseBalanceTotals } from '@/composable/use-base-balance-totals';
import {
  selectProjectedTotalAccounts,
  usePlannedDateLabel,
  useProjectedBalance,
} from '@/composable/use-projected-balance';
import { useAccountsStore } from '@/stores';
import { CalendarClockIcon } from '@lucide/vue';
import { storeToRefs } from 'pinia';
import { computed } from 'vue';

import EmptyState from './components/empty-state.vue';
import ErrorState from './components/error-state.vue';
import LoadingState from './components/loading-state.vue';
import WidgetWrapper from './components/widget-wrapper.vue';

defineOptions({ name: 'planned-overview-widget' });

const NEAREST_PLANS_LIMIT = 4;

const { accounts, isAccountsFetched } = storeToRefs(useAccountsStore());
const { formatBaseCurrency } = useFormatCurrency();
const { sumBaseBalance } = useBaseBalanceTotals();
const { formatPlannedDate } = usePlannedDateLabel();
const { aggregateFor, isFetching, isFetched, isError: isSummaryError, refetch: refetchSummary } = useProjectedBalance();
const {
  plans,
  isFetching: isPlansFetching,
  isPending: isPlansPending,
  isError: isPlansError,
  refetch: refetchPlans,
} = usePendingPlannedTransactions();

const scopedAccounts = computed(() => selectProjectedTotalAccounts({ accounts: accounts.value ?? [] }));
const planned = computed(() => aggregateFor({ accountIds: scopedAccounts.value.map((account) => account.id) }));

const realTotal = computed(() => sumBaseBalance({ accounts: scopedAccounts.value }));
const projectedTotal = computed(() => realTotal.value.total + planned.value.refPlannedDelta);

const { displayValue: animatedProjectedTotal } = useAnimatedNumber({ value: projectedTotal });

const projectedDisplay = computed(
  () => `${realTotal.value.isApprox ? '≈ ' : ''}${formatBaseCurrency(animatedProjectedTotal.value)}`,
);
const deltaDisplay = computed(() => {
  const delta = planned.value.refPlannedDelta;
  return `${delta > 0 ? '+' : ''}${formatBaseCurrency(delta)}`;
});
const deltaColorClass = computed(() =>
  planned.value.refPlannedDelta < 0 ? 'text-app-expense-color' : 'text-app-income-color',
);
const latestPlannedDisplay = computed(() => formatPlannedDate({ time: planned.value.latestTime }));

// Ascending time, so plans whose match window has already run out lead the list.
const nearestPlans = computed(() =>
  [...plans.value]
    .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())
    .slice(0, NEAREST_PLANS_LIMIT),
);

const isError = computed(() => isSummaryError.value || isPlansError.value);
const isInitialLoading = computed(() => !isFetched.value || !isAccountsFetched.value || isPlansPending.value);
const isEmpty = computed(() => planned.value.count === 0);

const retry = () => {
  void refetchSummary();
  void refetchPlans();
};
</script>

<template>
  <WidgetWrapper :is-fetching="isFetching || isPlansFetching">
    <template #title>{{ $t('dashboard.widgets.plannedOverview.title') }}</template>

    <template v-if="isError">
      <ErrorState :message="$t('dashboard.widgets.plannedOverview.loadFailed')" @retry="retry" />
    </template>

    <template v-else-if="isInitialLoading">
      <LoadingState />
    </template>

    <template v-else-if="isEmpty">
      <EmptyState>
        <CalendarClockIcon class="size-32" />
      </EmptyState>
    </template>

    <template v-else>
      <div class="flex h-full flex-col gap-3">
        <div>
          <p class="text-2xl font-bold tracking-tight tabular-nums">{{ projectedDisplay }}</p>
          <p class="text-muted-foreground mt-1 text-xs">
            {{ $t('dashboard.widgets.plannedOverview.projectedTotal') }}
          </p>
        </div>

        <div class="flex items-baseline justify-between gap-2">
          <span class="text-sm">
            {{ $t('dashboard.widgets.plannedOverview.pendingCount', { count: planned.count }) }}
          </span>
          <span class="text-amount text-sm" :class="deltaColorClass">{{ deltaDisplay }}</span>
        </div>

        <p v-if="latestPlannedDisplay" class="text-muted-foreground text-xs">
          {{ $t('dashboard.widgets.plannedOverview.through', { date: latestPlannedDisplay }) }}
        </p>

        <div v-if="nearestPlans.length" class="border-border/60 border-t pt-2">
          <TransactionsList raw-list class="gap-0.5!" :transactions="nearestPlans" :max-display="NEAREST_PLANS_LIMIT" />
        </div>
      </div>
    </template>
  </WidgetWrapper>
</template>
