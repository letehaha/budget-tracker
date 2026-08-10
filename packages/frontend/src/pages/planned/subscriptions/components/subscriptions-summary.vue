<script setup lang="ts">
import { loadSubscriptionsSummary } from '@/api/subscriptions';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import { useFormatCurrency } from '@/composable/formatters';
import { useCurrencyNotConnectedNotification } from '@/composable/use-currency-not-connected-notification';
import { isApiErrorWithCode } from '@/js/errors';
import { cn } from '@/lib/utils';
import { API_ERROR_CODES, SUBSCRIPTION_TYPES } from '@bt/shared/types';
import { useQuery } from '@tanstack/vue-query';
import { ArrowDownRightIcon, ArrowUpRightIcon } from '@lucide/vue';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

import { ALL_TYPES_FILTER, type SubscriptionTypeFilter, getPercentOfIncomeColorClass } from '../utils';

const props = defineProps<{
  activeFilter: SubscriptionTypeFilter;
}>();

const { t } = useI18n();
const { formatBaseCurrency } = useFormatCurrency();

const TYPE_BAR_CLASS: Record<SUBSCRIPTION_TYPES, string> = {
  [SUBSCRIPTION_TYPES.subscription]: 'bg-subscription-type-subscription',
  [SUBSCRIPTION_TYPES.bill]: 'bg-subscription-type-bill',
  [SUBSCRIPTION_TYPES.installment]: 'bg-subscription-type-installment',
};

const TYPE_LABEL_KEY: Record<SUBSCRIPTION_TYPES, string> = {
  [SUBSCRIPTION_TYPES.subscription]: 'planned.subscriptions.summary.filterSubscriptions',
  [SUBSCRIPTION_TYPES.bill]: 'planned.subscriptions.summary.filterBills',
  [SUBSCRIPTION_TYPES.installment]: 'planned.subscriptions.summary.filterInstallments',
};

const isUnfiltered = computed(() => props.activeFilter === ALL_TYPES_FILTER);

const queryKey = computed(() => [...VUE_QUERY_CACHE_KEYS.subscriptionsSummary, props.activeFilter]);

const {
  data: summary,
  isLoading,
  isPlaceholderData,
  isError,
  error,
} = useQuery({
  queryFn: () => loadSubscriptionsSummary({ type: isUnfiltered.value ? undefined : props.activeFilter }),
  queryKey,
  staleTime: Infinity,
  placeholderData: (previousData) => previousData,
});

useCurrencyNotConnectedNotification({ error });

// A missing currency link already surfaces as a persistent notification naming the
// fix, so the card stays out of the way for that one case.
const showLoadError = computed(
  () => isError.value && !summary.value && !isApiErrorWithCode(error.value, API_ERROR_CODES.currencyNotConnected),
);

const typeSummaries = Object.values(SUBSCRIPTION_TYPES).map((type) => ({
  type,
  query: useQuery({
    queryFn: () => loadSubscriptionsSummary({ type }),
    queryKey: [...VUE_QUERY_CACHE_KEYS.subscriptionsSummary, 'by-type', type],
    staleTime: Infinity,
    enabled: isUnfiltered,
  }),
}));

// Every type has to have landed: a pending or failed one contributing 0 would let
// the remaining segments re-normalise to 100% of a partial total.
const distributionSegments = computed(() => {
  const costs: { type: SUBSCRIPTION_TYPES; cost: number }[] = [];
  for (const { type, query } of typeSummaries) {
    const data = query.data.value;
    if (!query.isSuccess.value || !data) return [];
    costs.push({ type, cost: data.estimatedMonthlyCost });
  }

  const total = costs.reduce((acc, { cost }) => acc + cost, 0);
  if (total <= 0) return [];

  return costs
    .filter(({ cost }) => cost > 0)
    .map(({ type, cost }) => ({
      type,
      barClass: TYPE_BAR_CLASS[type],
      label: t(TYPE_LABEL_KEY[type]),
      amountDisplay: formatBaseCurrency(cost),
      width: `${((cost / total) * 100).toFixed(2)}%`,
    }));
});

const hasExpenses = computed(() => (summary.value?.activeCount.expense ?? 0) > 0);

const showDistribution = computed(
  () => isUnfiltered.value && hasExpenses.value && distributionSegments.value.length > 0,
);

// Income-only users still get a hero figure: their monthly income takes the primary
// slot, which also makes the income footer row redundant.
const hero = computed(() => {
  if (!summary.value) return null;
  if (hasExpenses.value) {
    return {
      isExpense: true,
      label: t('planned.subscriptions.summary.spendingLabel'),
      amount: t('planned.subscriptions.summary.monthlyCost', {
        amount: formatBaseCurrency(summary.value.estimatedMonthlyCost),
      }),
    };
  }
  return {
    isExpense: false,
    label: t('planned.subscriptions.summary.incomeLabel'),
    amount: t('planned.subscriptions.summary.monthlyIncome', {
      amount: formatBaseCurrency(summary.value.expectedMonthlyIncome),
    }),
  };
});

const percentOfIncome = computed(() => (hasExpenses.value ? (summary.value?.percentOfIncome ?? null) : null));

const percentOfIncomeClass = computed(() =>
  getPercentOfIncomeColorClass({ percent: percentOfIncome.value, type: props.activeFilter }),
);

const stats = computed(() => {
  if (!summary.value) return [];
  const result = [];

  if (hasExpenses.value) {
    result.push({
      key: 'yearly',
      label: t('planned.subscriptions.summary.projectedPerYearLabel'),
      value: formatBaseCurrency(summary.value.projectedYearlyCost),
    });
  }

  result.push({
    key: 'active',
    label: t('planned.subscriptions.summary.activeCountLabel'),
    value: String(summary.value.activeCount.expense + summary.value.activeCount.income),
  });

  return result;
});

const hasAnyActive = computed(() => {
  if (!summary.value) return false;
  return summary.value.activeCount.expense > 0 || summary.value.activeCount.income > 0;
});

const showIncomeFooter = computed(() => hasExpenses.value && (summary.value?.activeCount.income ?? 0) > 0);
</script>

<template>
  <!-- Loading skeleton (initial load only) -->
  <div v-if="isLoading && !summary" class="bg-card border-border @container rounded-lg border px-3 py-2.5 @sm:p-4">
    <div class="flex animate-pulse flex-col gap-2">
      <div class="bg-muted h-7 w-36 rounded @sm:h-8" />
      <div class="bg-muted h-4 w-64 rounded" />
    </div>
  </div>

  <!-- Load error -->
  <div
    v-else-if="showLoadError"
    class="bg-card border-border text-muted-foreground @container rounded-lg border px-3 py-2.5 text-sm @sm:p-4"
  >
    {{ $t('planned.subscriptions.summary.loadError') }}
  </div>

  <!-- Summary content -->
  <div
    v-else-if="summary && hasAnyActive"
    :class="
      cn(
        'bg-card border-border @container overflow-hidden rounded-lg border transition-opacity',
        isPlaceholderData && 'opacity-50',
      )
    "
  >
    <div v-if="hero" class="flex flex-col gap-5 px-3 py-3 @sm:p-4 @2xl:flex-row @2xl:items-center @2xl:gap-0">
      <div class="min-w-0 flex-1 @2xl:pr-6">
        <p class="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
          <span
            :class="
              cn(
                'flex size-4 items-center justify-center rounded-full',
                hero.isExpense
                  ? 'bg-app-expense-color/15 text-app-expense-color'
                  : 'bg-app-income-color/15 text-app-income-color',
              )
            "
          >
            <ArrowDownRightIcon v-if="hero.isExpense" class="size-3" />
            <ArrowUpRightIcon v-else class="size-3" />
          </span>
          {{ hero.label }}
        </p>
        <p
          :class="
            cn(
              'mt-1 flex flex-wrap items-baseline gap-x-2 text-2xl font-semibold tracking-tight tabular-nums @sm:text-3xl',
              !hero.isExpense && 'text-app-income-color',
            )
          "
        >
          {{ hero.amount }}
          <span v-if="percentOfIncome !== null" :class="[percentOfIncomeClass, 'text-sm font-normal tracking-normal']">
            {{ $t('planned.subscriptions.summary.percentOfIncome', { percent: percentOfIncome }) }}
          </span>
        </p>

        <div v-if="showDistribution" class="mt-3.5">
          <div class="flex h-2 gap-0.5 overflow-hidden rounded-full">
            <div
              v-for="segment in distributionSegments"
              :key="segment.type"
              :class="cn('rounded-full', segment.barClass)"
              :style="{ width: segment.width }"
            />
          </div>
          <div class="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5">
            <div v-for="segment in distributionSegments" :key="segment.type" class="flex items-center gap-1.5 text-xs">
              <span :class="cn('size-2 shrink-0 rounded-full', segment.barClass)" aria-hidden="true" />
              <span class="text-muted-foreground">{{ segment.label }}</span>
              <span class="font-medium tabular-nums">{{ segment.amountDisplay }}</span>
            </div>
          </div>
        </div>
      </div>

      <div
        :class="
          cn(
            '@2xl:border-border grid shrink-0 gap-x-6 gap-y-3 @2xl:border-l @2xl:pl-6',
            stats.length > 1 ? 'grid-cols-2' : 'grid-cols-1',
          )
        "
      >
        <div v-for="stat in stats" :key="stat.key" class="min-w-0">
          <div class="text-muted-foreground text-xs leading-tight font-semibold tracking-widest uppercase">
            {{ stat.label }}
          </div>
          <div class="mt-1 truncate text-base font-semibold tracking-tight tabular-nums">{{ stat.value }}</div>
        </div>
      </div>
    </div>

    <div
      v-if="showIncomeFooter"
      class="border-border flex flex-wrap items-center gap-x-2 gap-y-1 border-t px-3 py-2 text-xs @sm:px-4"
    >
      <span class="bg-app-income-color/15 text-app-income-color flex size-4 items-center justify-center rounded-full">
        <ArrowUpRightIcon class="size-3" />
      </span>
      <span class="text-muted-foreground">{{ $t('planned.subscriptions.summary.incomeLabel') }}</span>
      <span class="text-app-income-color font-medium tabular-nums">
        {{
          $t('planned.subscriptions.summary.monthlyIncome', {
            amount: formatBaseCurrency(summary.expectedMonthlyIncome),
          })
        }}
      </span>
      <span class="text-muted-foreground">
        &middot;
        {{
          $t(
            'planned.subscriptions.summary.acrossIncome',
            { count: summary.activeCount.income },
            summary.activeCount.income,
          )
        }}
      </span>
    </div>
  </div>
</template>
