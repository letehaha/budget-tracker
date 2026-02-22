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
import LoadingState from './components/loading-state.vue';
import WidgetWrapper from './components/widget-wrapper.vue';

const { t } = useI18n();

const { isAppInitialized } = storeToRefs(useRootStore());
const { formatBaseCurrency, formatAmountByCurrencyCode } = useFormatCurrency();
const { formatDistanceToNow } = useDateLocale();
const widgetConfigRef = inject<Ref<DashboardWidgetConfig> | null>('dashboard-widget-config', null);

const isOnDashboard = computed(() => !!widgetConfigRef?.value);
const displayLimit = computed(() => (isOnDashboard.value ? 5 : 5));
const widgetType = computed(() => {
  const cfg = widgetConfigRef?.value?.config;
  return (cfg?.type as string) || undefined;
});

const TITLE_KEYS: Record<string, string> = {
  subscription: 'dashboard.widgets.subscriptions.titleSubscriptions',
  bill: 'dashboard.widgets.subscriptions.titleBills',
};
const widgetTitle = computed(() => t(TITLE_KEYS[widgetType.value ?? ''] ?? 'dashboard.widgets.subscriptions.title'));

const { data: summary, isFetching: isSummaryFetching } = useQuery({
  queryKey: computed(() => [...VUE_QUERY_CACHE_KEYS.subscriptionsSummary, widgetType.value ?? 'all']),
  queryFn: () => loadSubscriptionsSummary({ type: widgetType.value }),
  staleTime: Infinity,
  enabled: isAppInitialized,
});

const { data: upcoming, isFetching: isUpcomingFetching } = useQuery({
  queryKey: computed(() => [...VUE_QUERY_CACHE_KEYS.widgetSubscriptionsUpcoming, widgetType.value ?? 'all']),
  queryFn: () => loadUpcomingPayments({ limit: 5, type: widgetType.value }),
  staleTime: Infinity,
  placeholderData: [],
  enabled: isAppInitialized,
});

const isFetching = computed(() => isSummaryFetching.value || isUpcomingFetching.value);
const isInitialLoading = computed(() => isFetching.value && !summary.value);
const isEmpty = computed(() => !summary.value || summary.value.activeCount === 0);

const formatNextDate = (dateStr: string | null) => {
  if (!dateStr) return '';
  return formatDistanceToNow(parseISO(dateStr), { addSuffix: true });
};
</script>

<template>
  <WidgetWrapper :is-fetching="isFetching">
    <template #title> {{ widgetTitle }} </template>
    <template #action>
      <router-link
        :to="{ name: ROUTES_NAMES.plannedSubscriptions }"
        :class="buttonVariants({ variant: 'ghost', size: 'sm', class: 'text-muted-foreground' })"
      >
        {{ $t('common.actions.viewAll') }}
      </router-link>
    </template>

    <template v-if="isInitialLoading">
      <LoadingState />
    </template>

    <template v-else-if="isEmpty && !isFetching">
      <EmptyState>
        <RepeatIcon class="size-32" />
      </EmptyState>
    </template>

    <template v-else>
      <!-- Monthly total -->
      <div v-if="summary && summary.activeCount > 0" class="mb-4">
        <p class="text-2xl font-bold tracking-tight">
          {{ formatBaseCurrency(summary.estimatedMonthlyCost) }}
        </p>
        <p class="text-muted-foreground mt-1 text-xs">
          {{ t('dashboard.widgets.subscriptions.activeSummary', { count: summary.activeCount }) }} &middot; ~{{
            formatBaseCurrency(summary.projectedYearlyCost)
          }}{{ t('dashboard.widgets.subscriptions.perYear') }}
        </p>
      </div>

      <!-- Upcoming payments list -->
      <div class="-mx-2 flex flex-col">
        <router-link
          v-for="payment in upcoming?.slice(0, displayLimit)"
          :key="payment.subscriptionId"
          :to="{ name: ROUTES_NAMES.plannedSubscriptionDetails, params: { id: payment.subscriptionId } }"
          class="hover:bg-muted/50 flex items-center gap-3 rounded-md px-3 py-1.5 transition-colors"
        >
          <SubscriptionServiceLogo :name="payment.subscriptionName" size="sm" />
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium">{{ payment.subscriptionName }}</p>
            <p class="text-muted-foreground text-xs">{{ formatNextDate(payment.nextPaymentDate) }}</p>
          </div>
          <span class="text-sm font-medium tabular-nums">
            {{
              payment.expectedCurrencyCode
                ? formatAmountByCurrencyCode(payment.expectedAmount, payment.expectedCurrencyCode)
                : formatBaseCurrency(payment.expectedAmount)
            }}
          </span>
        </router-link>
      </div>
    </template>
  </WidgetWrapper>
</template>
