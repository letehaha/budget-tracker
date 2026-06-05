<script lang="ts" setup>
import {
  DEFAULT_INCOME_LOOKBACK_MONTHS,
  type IncomeLookbackMonths,
  loadSubscriptionsSummary,
  loadUpcomingPayments,
} from '@/api/subscriptions';
import type { DashboardWidgetConfig } from '@/api/user-settings';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import { useFormatCurrency } from '@/composable/formatters';
import { useAnimatedNumber } from '@/composable/use-animated-number';
import { useDateLocale } from '@/composable/use-date-locale';
import { findServiceByName } from '@/common/utils/find-subscription-service';
import SubscriptionServiceLogo from '@/pages/planned/subscriptions/components/subscription-service-logo.vue';
import { ROUTES_NAMES } from '@/routes/constants';
import { useRootStore } from '@/stores';
import { useQuery } from '@tanstack/vue-query';
import { parseISO } from 'date-fns';
import { RepeatIcon } from '@lucide/vue';
import { storeToRefs } from 'pinia';
import type { Ref } from 'vue';
import { computed, inject } from 'vue';
import { useI18n } from 'vue-i18n';

import EmptyState from './components/empty-state.vue';
import LoadingState from './components/loading-state.vue';
import SubscriptionsOverviewSettingsPopover from './components/subscriptions-overview-settings-popover.vue';
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

const widgetLookbackMonths = computed<IncomeLookbackMonths>(() => {
  const cfg = widgetConfigRef?.value?.config;
  const raw = cfg?.lookbackMonths as number | undefined;
  return raw === 1 || raw === 3 || raw === 6 || raw === 12 ? raw : DEFAULT_INCOME_LOOKBACK_MONTHS;
});

const TITLE_KEYS: Record<string, string> = {
  subscription: 'dashboard.widgets.subscriptions.titleSubscriptions',
  bill: 'dashboard.widgets.subscriptions.titleBills',
};
const widgetTitle = computed(() => t(TITLE_KEYS[widgetType.value ?? ''] ?? 'dashboard.widgets.subscriptions.title'));

// Per-type thresholds for highlighting how heavy the recurring cost is relative to income.
// Subscriptions (entertainment-ish) should fire alarms much earlier than bills (rent/utilities).
const PERCENT_OF_INCOME_THRESHOLDS: Record<string, { yellow: number; red: number }> = {
  subscription: { yellow: 5, red: 10 },
  bill: { yellow: 30, red: 50 },
  all: { yellow: 20, red: 40 },
};

const percentOfIncomeColorClass = computed(() => {
  const percent = summary.value?.percentOfIncome;
  if (percent === null || percent === undefined) return 'text-muted-foreground';
  const { yellow, red } = PERCENT_OF_INCOME_THRESHOLDS[widgetType.value ?? 'all']!;
  if (percent >= red) return 'text-app-expense-color';
  if (percent >= yellow) return 'text-warning-text';
  return 'text-app-income-color';
});

const { data: summary, isFetching: isSummaryFetching } = useQuery({
  queryKey: computed(() => [
    ...VUE_QUERY_CACHE_KEYS.subscriptionsSummary,
    widgetType.value ?? 'all',
    widgetLookbackMonths.value,
  ]),
  queryFn: () => loadSubscriptionsSummary({ type: widgetType.value, lookbackMonths: widgetLookbackMonths.value }),
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

const { displayValue: animatedMonthlyCost } = useAnimatedNumber({
  value: computed(() => summary.value?.estimatedMonthlyCost ?? 0),
});

const formatNextDate = (dateStr: string | null) => {
  if (!dateStr) return '';
  return formatDistanceToNow(parseISO(dateStr), { addSuffix: true });
};

const hasServiceLogo = (name: string) => !!findServiceByName({ name });
</script>

<template>
  <WidgetWrapper :is-fetching="isFetching">
    <template #title> {{ widgetTitle }} </template>
    <template v-if="isOnDashboard" #action>
      <SubscriptionsOverviewSettingsPopover />
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
        <p class="flex flex-wrap items-baseline gap-x-2 text-2xl font-bold tracking-tight">
          {{ formatBaseCurrency(animatedMonthlyCost) }}
          <span v-if="summary.percentOfIncome !== null" :class="[percentOfIncomeColorClass, 'text-sm font-normal']">
            {{ $t('dashboard.widgets.subscriptions.percentOfIncome', { percent: summary.percentOfIncome }) }}
          </span>
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
          <SubscriptionServiceLogo
            v-if="hasServiceLogo(payment.subscriptionName)"
            :name="payment.subscriptionName"
            class="size-5"
          />
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium">{{ payment.subscriptionName }}</p>
            <p class="text-muted-foreground text-xs">{{ formatNextDate(payment.nextPaymentDate) }}</p>
          </div>
          <span class="text-amount text-sm">
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
