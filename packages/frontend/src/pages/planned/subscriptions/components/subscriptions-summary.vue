<script setup lang="ts">
import { loadSubscriptionsSummary } from '@/api/subscriptions';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import { useFormatCurrency } from '@/composable/formatters';
import { useCurrencyNotConnectedNotification } from '@/composable/use-currency-not-connected-notification';
import { useQuery } from '@tanstack/vue-query';
import { ArrowDownRightIcon, ArrowUpRightIcon } from '@lucide/vue';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

const props = defineProps<{
  activeFilter: string;
}>();

const { t } = useI18n();
const { formatBaseCurrency } = useFormatCurrency();

const queryKey = computed(() => [...VUE_QUERY_CACHE_KEYS.subscriptionsSummary, props.activeFilter]);

const {
  data: summary,
  isLoading,
  isPlaceholderData,
  error,
} = useQuery({
  queryFn: () =>
    loadSubscriptionsSummary({
      type: props.activeFilter === 'all' ? undefined : props.activeFilter,
    }),
  queryKey,
  staleTime: Infinity,
  placeholderData: (previousData) => previousData,
});

useCurrencyNotConnectedNotification({ error });

const activeLabel = computed(() => {
  if (!summary.value) return '';
  const count = summary.value.activeCount.expense;
  if (props.activeFilter === 'subscription') {
    return t('planned.subscriptions.summary.acrossSubscriptions', { count }, count);
  }
  if (props.activeFilter === 'bill') {
    return t('planned.subscriptions.summary.acrossBills', { count }, count);
  }
  return t('planned.subscriptions.summary.acrossAll', { count });
});

const hasAnyActive = computed(() => {
  if (!summary.value) return false;
  return summary.value.activeCount.expense > 0 || summary.value.activeCount.income > 0;
});

const hasBothDirections = computed(
  () => !!summary.value && summary.value.activeCount.expense > 0 && summary.value.activeCount.income > 0,
);
</script>

<template>
  <!-- Loading skeleton (initial load only) -->
  <div v-if="isLoading && !summary" class="bg-card border-border rounded-lg border px-3 py-2.5 sm:p-4">
    <div class="flex animate-pulse flex-col gap-2">
      <div class="bg-muted h-7 w-36 rounded sm:h-8" />
      <div class="bg-muted h-4 w-64 rounded" />
    </div>
  </div>

  <!-- Summary content -->
  <div
    v-else-if="summary && hasAnyActive"
    :class="[
      'bg-card border-border @container overflow-hidden rounded-lg border transition-opacity',
      isPlaceholderData && 'opacity-50',
    ]"
  >
    <div
      :class="[
        'divide-border grid grid-cols-1',
        hasBothDirections && 'divide-y @lg:grid-cols-2 @lg:divide-x @lg:divide-y-0',
      ]"
    >
      <div v-if="summary.activeCount.expense > 0" class="px-3 py-2.5 sm:p-4">
        <p class="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
          <span
            class="bg-app-expense-color/15 text-app-expense-color flex size-4 items-center justify-center rounded-full"
          >
            <ArrowDownRightIcon class="size-3" />
          </span>
          {{ $t('planned.subscriptions.summary.spendingLabel') }}
        </p>
        <p class="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">
          {{
            $t('planned.subscriptions.summary.monthlyCost', {
              amount: formatBaseCurrency(summary.estimatedMonthlyCost),
            })
          }}
        </p>
        <p class="text-muted-foreground mt-0.5 text-xs sm:text-sm">
          {{ activeLabel }}
          &middot;
          <i18n-t keypath="planned.subscriptions.summary.yearlyProjected" tag="span">
            <template #amount>
              <span class="text-foreground font-medium">
                {{
                  $t('planned.subscriptions.summary.perYear', {
                    amount: formatBaseCurrency(summary.projectedYearlyCost),
                  })
                }}
              </span>
            </template>
          </i18n-t>
        </p>
      </div>

      <div v-if="summary.activeCount.income > 0" class="px-3 py-2.5 sm:p-4">
        <p class="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
          <span
            class="bg-app-income-color/15 text-app-income-color flex size-4 items-center justify-center rounded-full"
          >
            <ArrowUpRightIcon class="size-3" />
          </span>
          {{ $t('planned.subscriptions.summary.incomeLabel') }}
        </p>
        <p class="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">
          {{
            $t('planned.subscriptions.summary.monthlyIncome', {
              amount: formatBaseCurrency(summary.expectedMonthlyIncome),
            })
          }}
        </p>
        <p class="text-muted-foreground mt-0.5 text-xs sm:text-sm">
          {{
            $t(
              'planned.subscriptions.summary.acrossIncome',
              { count: summary.activeCount.income },
              summary.activeCount.income,
            )
          }}
        </p>
      </div>
    </div>
  </div>
</template>
