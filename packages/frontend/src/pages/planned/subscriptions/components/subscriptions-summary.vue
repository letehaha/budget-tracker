<script setup lang="ts">
import { loadSubscriptionsSummary } from '@/api/subscriptions';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import Tabs from '@/components/lib/ui/tabs/Tabs.vue';
import TabsList from '@/components/lib/ui/tabs/TabsList.vue';
import TabsTrigger from '@/components/lib/ui/tabs/TabsTrigger.vue';
import { useFormatCurrency } from '@/composable/formatters';
import { useQuery } from '@tanstack/vue-query';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();
const { formatBaseCurrency } = useFormatCurrency();

const activeFilter = ref<string>('all');

const queryKey = computed(() => [...VUE_QUERY_CACHE_KEYS.subscriptionsSummary, activeFilter.value]);

const {
  data: summary,
  isLoading,
  isPlaceholderData,
} = useQuery({
  queryFn: () =>
    loadSubscriptionsSummary({
      type: activeFilter.value === 'all' ? undefined : activeFilter.value,
    }),
  queryKey,
  staleTime: Infinity,
  placeholderData: (previousData) => previousData,
});

const activeLabel = computed(() => {
  if (!summary.value) return '';
  const count = summary.value.activeCount;
  if (activeFilter.value === 'subscription') {
    return t('planned.subscriptions.summary.acrossSubscriptions', { count }, count);
  }
  if (activeFilter.value === 'bill') {
    return t('planned.subscriptions.summary.acrossBills', { count }, count);
  }
  return t('planned.subscriptions.summary.acrossAll', { count });
});
</script>

<template>
  <!-- Loading skeleton (initial load only) -->
  <div v-if="isLoading && !summary" class="bg-card border-border mb-3 rounded-lg border px-3 py-2.5 sm:mb-6 sm:p-4">
    <div class="flex animate-pulse flex-col gap-2">
      <div class="bg-muted h-7 w-36 rounded sm:h-8" />
      <div class="bg-muted h-4 w-64 rounded" />
    </div>
  </div>

  <!-- Summary content -->
  <div
    v-else-if="summary && summary.activeCount > 0"
    :class="[
      'bg-card border-border mb-3 rounded-lg border px-3 py-2.5 transition-opacity sm:mb-6 sm:p-4',
      isPlaceholderData && 'opacity-50',
    ]"
  >
    <Tabs v-model="activeFilter" default-value="all" class="mb-2 sm:mb-3">
      <TabsList>
        <TabsTrigger value="all">{{ $t('planned.subscriptions.summary.filterAll') }}</TabsTrigger>
        <TabsTrigger value="subscription">{{ $t('planned.subscriptions.summary.filterSubscriptions') }}</TabsTrigger>
        <TabsTrigger value="bill">{{ $t('planned.subscriptions.summary.filterBills') }}</TabsTrigger>
      </TabsList>
    </Tabs>

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
