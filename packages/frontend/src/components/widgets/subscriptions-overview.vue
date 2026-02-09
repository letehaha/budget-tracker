<script lang="ts" setup>
import { loadSubscriptionsSummary, loadUpcomingPayments } from '@/api/subscriptions';
import type { DashboardWidgetConfig } from '@/api/user-settings';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import { buttonVariants } from '@/components/lib/ui/button';
import { useFormatCurrency } from '@/composable/formatters';
import { useDateLocale } from '@/composable/use-date-locale';
import SubscriptionServiceLogo from '@/pages/planned/subscriptions/components/subscription-service-logo.vue';
import { ROUTES_NAMES } from '@/routes/constants';
import { useRootStore } from '@/stores';
import { useQuery } from '@tanstack/vue-query';
import { parseISO } from 'date-fns';
import { RepeatIcon } from 'lucide-vue-next';
import { storeToRefs } from 'pinia';
import type { Ref } from 'vue';
import { computed, inject } from 'vue';
import { useI18n } from 'vue-i18n';

import EmptyState from './components/empty-state.vue';
import WidgetWrapper from './components/widget-wrapper.vue';

const { t } = useI18n();

const { isAppInitialized } = storeToRefs(useRootStore());
const { formatBaseCurrency } = useFormatCurrency();
const { formatDistanceToNow } = useDateLocale();
const widgetConfigRef = inject<Ref<DashboardWidgetConfig> | null>('dashboard-widget-config', null);

const isOnDashboard = computed(() => !!widgetConfigRef?.value);
const displayLimit = computed(() => (isOnDashboard.value ? 4 : 5));

const { data: summary, isFetching: isSummaryFetching } = useQuery({
  queryKey: VUE_QUERY_CACHE_KEYS.subscriptionsSummary,
  queryFn: () => loadSubscriptionsSummary(),
  staleTime: Infinity,
  enabled: isAppInitialized,
});

const { data: upcoming, isFetching: isUpcomingFetching } = useQuery({
  queryKey: VUE_QUERY_CACHE_KEYS.widgetSubscriptionsUpcoming,
  queryFn: () => loadUpcomingPayments({ limit: 5 }),
  staleTime: Infinity,
  placeholderData: [],
  enabled: isAppInitialized,
});

const isFetching = computed(() => isSummaryFetching.value || isUpcomingFetching.value);
const isEmpty = computed(() => !summary.value || summary.value.activeCount === 0);

const formatNextDate = (dateStr: string | null) => {
  if (!dateStr) return '';
  return formatDistanceToNow(parseISO(dateStr), { addSuffix: true });
};
</script>

<template>
  <WidgetWrapper :is-fetching="isFetching">
    <template #title> {{ $t('dashboard.widgets.subscriptions.title') }} </template>
    <template #action>
      <router-link
        :to="{ name: ROUTES_NAMES.plannedSubscriptions }"
        :class="buttonVariants({ variant: 'link', size: 'sm' })"
      >
        {{ $t('common.actions.viewAll') }}
      </router-link>
    </template>

    <template v-if="isEmpty && !isFetching">
      <EmptyState>
        <RepeatIcon class="size-32" />
      </EmptyState>
    </template>

    <template v-else>
      <!-- Monthly total -->
      <div v-if="summary && summary.activeCount > 0" class="mb-4">
        <p class="text-xl font-bold tracking-wide">
          {{ formatBaseCurrency(summary.estimatedMonthlyCost) }}
        </p>
        <p class="text-muted-foreground text-xs">
          {{ t('dashboard.widgets.subscriptions.activeSummary', { count: summary.activeCount }) }} &middot; ~{{
            formatBaseCurrency(summary.projectedYearlyCost)
          }}{{ t('dashboard.widgets.subscriptions.perYear') }}
        </p>
      </div>

      <!-- Upcoming payments list -->
      <div class="flex flex-col gap-2">
        <div
          v-for="payment in upcoming?.slice(0, displayLimit)"
          :key="payment.subscriptionId"
          class="flex items-center gap-3 rounded-md px-1 py-1.5"
        >
          <SubscriptionServiceLogo :name="payment.subscriptionName" size="sm" />
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium">{{ payment.subscriptionName }}</p>
            <p class="text-muted-foreground text-xs">{{ formatNextDate(payment.nextPaymentDate) }}</p>
          </div>
          <span class="text-sm font-medium tabular-nums">
            {{ formatBaseCurrency(payment.expectedAmount) }}
          </span>
        </div>
      </div>
    </template>
  </WidgetWrapper>
</template>
