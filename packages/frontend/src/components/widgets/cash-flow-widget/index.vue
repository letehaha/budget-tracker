<script lang="ts" setup>
import { useFormatCurrency } from '@/composable/formatters';
import { useAnimatedNumber } from '@/composable/use-animated-number';
import { calculatePercentageDifference } from '@/js/helpers/math/calculate-percentage-difference';
import ResponsiveTooltip from '@/components/common/responsive-tooltip.vue';
import { format, isSameMonth, parseISO } from 'date-fns';
import { ArrowDownRightIcon, ArrowUpRightIcon, InfoIcon, WalletIcon } from '@lucide/vue';
import { computed } from 'vue';

import EmptyState from '../components/empty-state.vue';
import LoadingState from '../components/loading-state.vue';
import WidgetWrapper from '../components/widget-wrapper.vue';
import { useCashFlowData } from './use-cash-flow-data';

defineOptions({ name: 'cash-flow-widget' });

const props = defineProps<{
  selectedPeriod: { from: Date; to: Date };
}>();

const { formatBaseCurrency } = useFormatCurrency();

const {
  currentTotals,
  prevNetFlow,
  trendPeriods,
  unionPeriods,
  hasCurrentData,
  hasPrevData,
  isFetching,
  isInitialLoading,
  isEmpty,
} = useCashFlowData({ selectedPeriod: () => props.selectedPeriod });

const income = computed(() => currentTotals.value.income);
const expenses = computed(() => currentTotals.value.expenses);
const netFlow = computed(() => currentTotals.value.netFlow);
const savingsRate = computed(() => currentTotals.value.savingsRate);

const { displayValue: animatedIncome } = useAnimatedNumber({ value: income });
const { displayValue: animatedExpenses } = useAnimatedNumber({ value: expenses });
const { displayValue: animatedNetFlow } = useAnimatedNumber({ value: netFlow });

// Flow bar proportions
const flowBarTotal = computed(() => income.value + expenses.value);

const incomePercent = computed(() => {
  if (flowBarTotal.value === 0) return 50;
  return Math.max(5, (income.value / flowBarTotal.value) * 100);
});

const expensePercent = computed(() => {
  if (flowBarTotal.value === 0) return 50;
  return Math.max(5, (expenses.value / flowBarTotal.value) * 100);
});

// Percentage change vs previous period
const netFlowDiff = computed(() => Number(calculatePercentageDifference(netFlow.value, prevNetFlow.value).toFixed(1)));

const periodLabel = computed(() => {
  const { from, to } = props.selectedPeriod;
  if (isSameMonth(from, to)) {
    return format(from, 'MMMM yyyy');
  }
  return `${format(from, 'MMM d')} - ${format(to, 'MMM d, yyyy')}`;
});

const isPositiveFlow = computed(() => netFlow.value >= 0);

const trendBars = computed(() => {
  const buckets = trendPeriods.value;
  const apiPeriods = unionPeriods.value;

  // Past periods come from the union response; the current period uses currentTotals.
  if (!apiPeriods.length && !hasCurrentData.value) return [];

  const aggregated = buckets.map((bucket) => {
    let bucketNetFlow: number;

    if (bucket.isCurrent) {
      bucketNetFlow = netFlow.value;
    } else {
      bucketNetFlow = 0;
      for (const ap of apiPeriods) {
        const apStart = parseISO(ap.periodStart);
        if (apStart >= bucket.from && apStart <= bucket.to) {
          bucketNetFlow += ap.netFlow;
        }
      }
    }

    return { ...bucket, netFlow: bucketNetFlow };
  });

  const maxAbs = Math.max(...aggregated.map((p) => Math.abs(p.netFlow)), 1);

  return aggregated.map((p) => {
    const isSingleMonth = isSameMonth(p.from, p.to);
    const label = isSingleMonth ? format(p.from, 'MMM') : `${format(p.from, 'MMM d')} - ${format(p.to, 'MMM d')}`;
    const shortLabel = isSingleMonth ? format(p.from, 'MMM') : format(p.from, 'MMM yy');

    return {
      label,
      shortLabel,
      value: p.netFlow,
      heightPercent: (Math.abs(p.netFlow) / maxAbs) * 100,
      isPositive: p.netFlow >= 0,
      isCurrent: p.isCurrent,
      formatted: formatBaseCurrency(p.netFlow),
    };
  });
});
</script>

<template>
  <WidgetWrapper :is-fetching="isFetching">
    <template #title>
      <span class="inline-flex items-center gap-1">
        {{ $t('dashboard.widgets.cashFlow.title') }}

        <ResponsiveTooltip
          :content="$t('dashboard.widgets.cashFlow.description')"
          content-class-name="max-w-56"
          :delay-duration="100"
        >
          <InfoIcon class="text-muted-foreground ml-1 size-4 cursor-help" />
        </ResponsiveTooltip>
      </span>
    </template>

    <template v-if="isInitialLoading">
      <LoadingState />
    </template>

    <template v-else-if="isEmpty && !isFetching">
      <EmptyState>
        <WalletIcon class="size-32" />
      </EmptyState>
    </template>

    <template v-else>
      <div class="flex h-full flex-col gap-3">
        <!-- Header: net flow amount + period -->
        <div class="mb-4">
          <div class="flex items-start justify-between gap-2">
            <div>
              <p
                class="text-2xl font-bold tracking-tight"
                :class="isPositiveFlow ? 'text-app-income-color' : 'text-app-expense-color'"
              >
                {{ isPositiveFlow ? '+' : '' }}{{ formatBaseCurrency(animatedNetFlow) }}
              </p>
              <p class="text-muted-foreground mt-0.5 text-xs font-medium tracking-tight uppercase">
                {{ periodLabel }}
              </p>
            </div>

            <!-- Comparison badge -->
            <div v-if="hasPrevData" class="flex flex-col items-end gap-0.5">
              <span
                class="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold"
                :class="{
                  'bg-success-text/15 text-success-text': netFlowDiff > 0,
                  'bg-destructive-text/15 text-destructive-text': netFlowDiff < 0,
                  'bg-muted text-muted-foreground': netFlowDiff === 0,
                }"
              >
                <ArrowUpRightIcon v-if="netFlowDiff > 0" class="size-3" />
                <ArrowDownRightIcon v-else-if="netFlowDiff < 0" class="size-3" />
                {{ netFlowDiff > 0 ? '+' : '' }}{{ netFlowDiff }}%
              </span>
              <span class="text-muted-foreground text-[10px]">
                {{ $t('dashboard.widgets.cashFlow.vsPrevious') }}
              </span>
            </div>
          </div>
        </div>

        <!-- Flow bar visualization -->
        <div>
          <div class="flex h-3 w-full overflow-hidden rounded-full">
            <div
              class="bg-app-income-color transition-all duration-500 ease-out"
              :style="{ width: `${incomePercent}%` }"
            />
            <div class="bg-muted w-px shrink-0" />
            <div
              class="bg-app-expense-color transition-all duration-500 ease-out"
              :style="{ width: `${expensePercent}%` }"
            />
          </div>
        </div>

        <!-- Stats grid -->
        <div class="grid grid-cols-3 gap-3">
          <!-- Income -->
          <div class="rounded-lg border p-3">
            <div class="text-muted-foreground mb-1 text-[11px] font-medium tracking-wider uppercase">
              {{ $t('dashboard.widgets.cashFlow.income') }}
            </div>
            <div class="text-app-income-color text-amount text-sm">
              {{ formatBaseCurrency(animatedIncome) }}
            </div>
          </div>

          <!-- Expenses -->
          <div class="rounded-lg border p-3">
            <div class="text-muted-foreground mb-1 text-[11px] font-medium tracking-wider uppercase">
              {{ $t('dashboard.widgets.cashFlow.expenses') }}
            </div>
            <div class="text-app-expense-color text-amount text-sm">
              {{ formatBaseCurrency(animatedExpenses) }}
            </div>
          </div>

          <!-- Savings rate -->
          <div class="rounded-lg border p-3">
            <div class="text-muted-foreground mb-1 text-[11px] font-medium tracking-wider uppercase">
              {{ $t('dashboard.widgets.cashFlow.saved') }}
            </div>
            <div
              class="text-amount text-sm"
              :class="savingsRate >= 0 ? 'text-app-income-color' : 'text-app-expense-color'"
            >
              {{ savingsRate }}%
            </div>
          </div>
        </div>

        <!-- Trend mini bars -->
        <div v-if="trendBars.length" class="mt-auto flex flex-col gap-1.5">
          <div class="text-muted-foreground text-[11px] font-medium tracking-wider uppercase">
            {{ $t('dashboard.widgets.cashFlow.previousPeriodsTrend') }}
          </div>
          <div class="flex h-25 items-end gap-2.5">
            <ResponsiveTooltip v-for="(bar, index) in trendBars" :key="index" :delay-duration="100">
              <div class="flex flex-1 flex-col items-center gap-1">
                <div class="flex h-22 w-full max-w-10 items-end justify-center">
                  <div
                    class="min-h-1 w-full rounded-xs transition-all duration-500"
                    :class="bar.isPositive ? 'bg-app-income-color/90' : 'bg-app-expense-color/90'"
                    :style="{ height: `${Math.max(bar.heightPercent, 4)}%` }"
                  />
                </div>
                <span class="text-muted-foreground text-[9px] leading-none">{{ bar.shortLabel }}</span>
              </div>
              <template #content>
                <span>{{ bar.label }}: </span>
                <span
                  class="font-semibold"
                  :class="bar.isPositive ? 'text-app-income-color' : 'text-app-expense-color'"
                >
                  {{ bar.formatted }}
                </span>
              </template>
            </ResponsiveTooltip>
          </div>
        </div>
      </div>
    </template>
  </WidgetWrapper>
</template>
