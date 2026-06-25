<script lang="ts" setup>
import {
  DEFAULT_INCOME_LOOKBACK_MONTHS,
  type IncomeLookbackMonths,
  type SubscriptionListItem,
  loadSubscriptions,
  loadSubscriptionsSummary,
  loadUpcomingPayments,
} from '@/api/subscriptions';
import type { DashboardWidgetConfig } from '@/api/user-settings';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import { useFormatCurrency } from '@/composable/formatters';
import { useAnimatedNumber } from '@/composable/use-animated-number';
import { useDateLocale } from '@/composable/use-date-locale';
import BrandLogo from '@/components/common/brand-logo.vue';
import UiButton from '@/components/lib/ui/button/Button.vue';
import { DesktopOnlyTooltip } from '@/components/lib/ui/tooltip';
import { ROUTES_NAMES } from '@/routes/constants';
import { useRootStore } from '@/stores';
import { SUBSCRIPTION_PERIOD_STATUSES } from '@bt/shared/types';
import { useQuery } from '@tanstack/vue-query';
import { differenceInCalendarDays, parseISO, startOfDay } from 'date-fns';
import { CheckIcon, ExternalLinkIcon, RepeatIcon } from '@lucide/vue';
import { storeToRefs } from 'pinia';
import type { Ref } from 'vue';
import { computed, inject, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';

import SubscriptionMarkPaidDialog from '@/pages/planned/subscriptions/components/subscription-mark-paid-dialog.vue';
import EmptyState from './components/empty-state.vue';
import LoadingState from './components/loading-state.vue';
import SubscriptionsOverviewSettingsPopover from './components/subscriptions-overview-settings-popover.vue';
import WidgetWrapper from './components/widget-wrapper.vue';

const { t } = useI18n();
const router = useRouter();

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
  installment: 'dashboard.widgets.subscriptions.titleInstallments',
};
const widgetTitle = computed(() => t(TITLE_KEYS[widgetType.value ?? ''] ?? 'dashboard.widgets.subscriptions.titleAll'));

// Per-type thresholds for highlighting how heavy the recurring cost is relative to income.
// Subscriptions (entertainment-ish) should fire alarms much earlier than bills (rent/utilities).
const PERCENT_OF_INCOME_THRESHOLDS: Record<string, { yellow: number; red: number }> = {
  subscription: { yellow: 5, red: 10 },
  bill: { yellow: 30, red: 50 },
  installment: { yellow: 30, red: 50 },
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

// Subscriptions list is fetched to get currentPeriod (id + status) for inline mark-paid.
// It shares the same cache key as the subscriptions page, so no extra network request
// when both are open.
const { data: allSubscriptions, isFetching: isSubscriptionsFetching } = useQuery({
  queryKey: VUE_QUERY_CACHE_KEYS.subscriptionsList,
  queryFn: () => loadSubscriptions({ isActive: true }),
  staleTime: Infinity,
  placeholderData: [],
  enabled: isAppInitialized,
});

const isFetching = computed(() => isSummaryFetching.value || isUpcomingFetching.value || isSubscriptionsFetching.value);
const isInitialLoading = computed(() => isFetching.value && !summary.value);
const isEmpty = computed(() => !summary.value || summary.value.activeCount === 0);

const { displayValue: animatedMonthlyCost } = useAnimatedNumber({
  value: computed(() => summary.value?.estimatedMonthlyCost ?? 0),
});

const formatNextDate = ({ dateStr }: { dateStr: string | null }) => {
  if (!dateStr) return '';
  return formatDistanceToNow(parseISO(dateStr), { addSuffix: true });
};

// --- Overdue / upcoming-in-3-days section ---

const UPCOMING_WINDOW_DAYS = 3;

function getDaysUntilDue({ dueDate }: { dueDate: string }): number {
  return differenceInCalendarDays(parseISO(dueDate), startOfDay(new Date()));
}

function isPeriodOverdue({ subscription }: { subscription: SubscriptionListItem }): boolean {
  const period = subscription.currentPeriod;
  if (!period) return false;
  return period.status === SUBSCRIPTION_PERIOD_STATUSES.overdue || getDaysUntilDue({ dueDate: period.dueDate }) < 0;
}

// Items with an open period that is overdue OR due within the next 3 days.
// Overdue items are sorted first, then by ascending dueDate.
const actionableItems = computed<SubscriptionListItem[]>(() => {
  if (!allSubscriptions.value) return [];

  const filtered = allSubscriptions.value.filter((sub) => {
    if (!sub.currentPeriod) return false;
    const overdue = isPeriodOverdue({ subscription: sub });
    if (overdue) return true;
    const daysLeft = getDaysUntilDue({ dueDate: sub.currentPeriod.dueDate });
    return daysLeft >= 0 && daysLeft <= UPCOMING_WINDOW_DAYS;
  });

  return filtered.toSorted((a, b) => {
    const aOverdue = isPeriodOverdue({ subscription: a });
    const bOverdue = isPeriodOverdue({ subscription: b });
    if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;
    const aDate = a.currentPeriod?.dueDate ?? '';
    const bDate = b.currentPeriod?.dueDate ?? '';
    return aDate.localeCompare(bDate);
  });
});

// Exactly 1 item: render inline. 2+: show collapsed summary row. 0: all-caught-up message.
const MAX_INLINE_ITEMS = 1;
const showInline = computed(() => actionableItems.value.length === MAX_INLINE_ITEMS);
const showCollapsed = computed(() => actionableItems.value.length > MAX_INLINE_ITEMS);
const showAllCaughtUp = computed(() => actionableItems.value.length === 0 && !isFetching.value && !isEmpty.value);

// --- Mark paid dialog ---

const markPaidRef = ref<InstanceType<typeof SubscriptionMarkPaidDialog>>();
const isMarkingPaid = computed(() => markPaidRef.value?.isPending ?? false);

function payPeriod({ subscription }: { subscription: SubscriptionListItem }) {
  if (!subscription.currentPeriod) return;
  markPaidRef.value?.triggerPay({ subscription, periodId: subscription.currentPeriod.id });
}

function openSubscriptionsList() {
  router.push({ name: ROUTES_NAMES.plannedSubscriptions });
}
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

      <!-- Upcoming payments list (original) -->
      <div class="-mx-2 flex flex-col">
        <router-link
          v-for="payment in upcoming?.slice(0, displayLimit)"
          :key="payment.subscriptionId"
          :to="{ name: ROUTES_NAMES.plannedSubscriptionDetails, params: { id: payment.subscriptionId } }"
          class="hover:bg-muted/50 flex items-center gap-3 rounded-md px-3 py-1.5 transition-colors"
        >
          <BrandLogo :domain="payment.logoDomain" :name="payment.subscriptionName" class="size-5" />
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium">{{ payment.subscriptionName }}</p>
            <p class="text-muted-foreground text-xs">{{ formatNextDate({ dateStr: payment.nextPaymentDate }) }}</p>
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

      <!-- Divider before overdue/upcoming action section -->
      <div v-if="!isFetching" class="border-border my-3 border-t" />

      <!-- All caught up -->
      <p v-if="showAllCaughtUp" class="text-muted-foreground px-1 text-xs">
        {{ $t('widgets.subscriptionsOverview.empty') }}
      </p>

      <!-- Single inline actionable item -->
      <div v-else-if="showInline" class="-mx-2">
        <div v-for="sub in actionableItems" :key="sub.id" class="flex items-center gap-3 rounded-md px-3 py-1.5">
          <!-- Overdue badge -->
          <span
            v-if="isPeriodOverdue({ subscription: sub })"
            class="bg-destructive/10 text-destructive-text shrink-0 rounded-full px-2 py-0.5 text-xs font-medium"
          >
            {{ $t('widgets.subscriptionsOverview.overdueBadge') }}
          </span>

          <BrandLogo :domain="sub.logoDomain" :name="sub.name" class="size-5 shrink-0" />

          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium">{{ sub.name }}</p>
            <p class="text-muted-foreground text-xs">
              {{ sub.currentPeriod ? formatNextDate({ dateStr: sub.currentPeriod.dueDate }) : '' }}
            </p>
          </div>

          <span v-if="sub.expectedAmount && sub.expectedCurrencyCode" class="shrink-0 text-sm font-medium">
            {{ formatAmountByCurrencyCode(sub.expectedAmount, sub.expectedCurrencyCode) }}
          </span>

          <DesktopOnlyTooltip :content="$t('widgets.subscriptionsOverview.payAction')">
            <UiButton
              variant="soft-success"
              size="icon-sm"
              :disabled="isMarkingPaid"
              @click="payPeriod({ subscription: sub })"
            >
              <CheckIcon class="size-4" />
            </UiButton>
          </DesktopOnlyTooltip>
        </div>
      </div>

      <!-- Collapsed: 2+ actionable items -->
      <div v-else-if="showCollapsed" class="flex items-center justify-between px-1">
        <p class="text-sm font-medium">
          {{ $t('widgets.subscriptionsOverview.upcoming.collapsed', { count: actionableItems.length }) }}
        </p>
        <UiButton variant="ghost-primary" size="sm" @click="openSubscriptionsList">
          <ExternalLinkIcon class="size-3.5" />
          {{ $t('widgets.subscriptionsOverview.upcoming.collapsedAction') }}
        </UiButton>
      </div>
    </template>
  </WidgetWrapper>

  <!-- Mark paid dialog — rendered outside WidgetWrapper to avoid stacking context clipping -->
  <SubscriptionMarkPaidDialog ref="markPaidRef" />
</template>
