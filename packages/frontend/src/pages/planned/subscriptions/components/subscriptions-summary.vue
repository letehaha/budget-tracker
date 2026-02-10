<script setup lang="ts">
import { loadSubscriptionsSummary } from '@/api/subscriptions';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import { useFormatCurrency } from '@/composable/formatters';
import { useQuery } from '@tanstack/vue-query';
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
} = useQuery({
  queryFn: () =>
    loadSubscriptionsSummary({
      type: props.activeFilter === 'all' ? undefined : props.activeFilter,
    }),
  queryKey,
  staleTime: Infinity,
  placeholderData: (previousData) => previousData,
});

const activeLabel = computed(() => {
  if (!summary.value) return '';
  const count = summary.value.activeCount;
  if (props.activeFilter === 'subscription') {
    return t('planned.subscriptions.summary.acrossSubscriptions', { count }, count);
  }
  if (props.activeFilter === 'bill') {
    return t('planned.subscriptions.summary.acrossBills', { count }, count);
  }
  return t('planned.subscriptions.summary.acrossAll', { count });
});
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
    v-else-if="summary && summary.activeCount > 0"
    :class="[
      'bg-card border-border rounded-lg border px-3 py-2.5 transition-opacity sm:p-4',
      isPlaceholderData && 'opacity-50',
    ]"
  >
    <p class="text-xl font-semibold tracking-tight sm:text-2xl">
      {{
        $t('planned.subscriptions.summary.monthlyCost', { amount: formatBaseCurrency(summary.estimatedMonthlyCost) })
      }}
    </p>
    <p class="text-muted-foreground mt-0.5 text-xs sm:mt-1 sm:text-sm">
      {{ activeLabel }}
      &middot;
      <i18n-t keypath="planned.subscriptions.summary.yearlyProjected" tag="span">
        <template #amount>
          <span class="text-foreground font-medium">
            {{
              $t('planned.subscriptions.summary.perYear', { amount: formatBaseCurrency(summary.projectedYearlyCost) })
            }}
          </span>
        </template>
      </i18n-t>
    </p>
  </div>
</template>
