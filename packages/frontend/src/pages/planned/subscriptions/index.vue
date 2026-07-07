<script setup lang="ts">
import {
  type SubscriptionListItem,
  createSubscription,
  deleteSubscription,
  loadSubscriptions,
  toggleSubscriptionActive,
} from '@/api/subscriptions';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import ResponsiveAlertDialog from '@/components/common/responsive-alert-dialog.vue';
import ResponsiveDialog from '@/components/common/responsive-dialog.vue';
import Button from '@/components/lib/ui/button/Button.vue';
import { PillTabs } from '@/components/lib/ui/pill-tabs';
import { useNotificationCenter } from '@/components/notification-center';
import { type Period } from '@/composable/use-period-navigation';
import { ApiErrorResponseError } from '@/js/errors';
import { ROUTES_NAMES } from '@/routes';
import { SUBSCRIPTION_TYPES } from '@bt/shared/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { useLocalStorage } from '@vueuse/core';
import { addYears, endOfMonth, isWithinInterval, parseISO, startOfDay } from 'date-fns';
import { PlusIcon, RepeatIcon, SearchIcon } from '@lucide/vue';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';

import DiscoverCandidatesDialog from './components/discover-candidates-dialog.vue';
import SubscriptionFormDialog from './components/subscription-form-dialog.vue';
import SubscriptionRow from './components/subscription-list-item.vue';
import SubscriptionMarkPaidDialog from './components/subscription-mark-paid-dialog.vue';
import SubscriptionsPeriodSelector from './components/subscriptions-period-selector.vue';
import SubscriptionsSortSelect from './components/subscriptions-sort-select.vue';
import SubscriptionsSummary from './components/subscriptions-summary.vue';
import {
  DEFAULT_SUBSCRIPTION_SORT,
  SUBSCRIPTION_SORT_STORAGE_KEY,
  type SubscriptionSortKey,
  isSubscriptionSortKey,
} from './utils';

const { t } = useI18n();
const router = useRouter();
const queryClient = useQueryClient();
const { addSuccessNotification, addErrorNotification } = useNotificationCenter();

const isCreateDialogOpen = ref(false);
const isDiscoverDialogOpen = ref(false);
const createFormRef = ref<InstanceType<typeof SubscriptionFormDialog> | null>(null);
const deleteTarget = ref<SubscriptionListItem | null>(null);
const activeFilter = ref<string>('all');

const ALL_TIME_END = endOfMonth(addYears(startOfDay(new Date()), 10));
const periodFilter = ref<Period>({
  from: startOfDay(new Date()),
  to: ALL_TIME_END,
});

const isPeriodFilterActive = computed(() => periodFilter.value.to.getTime() !== ALL_TIME_END.getTime());

const sortBy = useLocalStorage<SubscriptionSortKey>(SUBSCRIPTION_SORT_STORAGE_KEY, DEFAULT_SUBSCRIPTION_SORT);
// Guard against a stale/invalid value persisted by an older build.
if (!isSubscriptionSortKey(sortBy.value)) sortBy.value = DEFAULT_SUBSCRIPTION_SORT;

// The server returns the list already sorted, so `sortBy` is part of the query
// key: changing it refetches the correctly ordered list. The `subscriptionsList`
// prefix stays constant, so prefix-based invalidations elsewhere still match.
const subscriptionsQueryKey = computed(() => [...VUE_QUERY_CACHE_KEYS.subscriptionsList, sortBy.value]);

const { data: subscriptions, isPlaceholderData } = useQuery({
  queryFn: () => loadSubscriptions({ sortBy: sortBy.value }),
  queryKey: subscriptionsQueryKey,
  staleTime: Infinity,
  placeholderData: [],
});

const filteredSubscriptions = computed(() => {
  if (!subscriptions.value) return [];

  let result = subscriptions.value;

  if (activeFilter.value !== 'all') {
    result = result.filter((s) => s.type === activeFilter.value);
  }

  if (isPeriodFilterActive.value) {
    const interval = { start: periodFilter.value.from, end: periodFilter.value.to };
    result = result.filter((s) => {
      if (!s.nextDueDate) return false;
      return isWithinInterval(parseISO(s.nextDueDate), interval);
    });
  }

  return result;
});

const filterItems = computed(() => [
  { value: 'all', label: t('planned.subscriptions.summary.filterAll') },
  { value: SUBSCRIPTION_TYPES.subscription, label: t('planned.subscriptions.summary.filterSubscriptions') },
  { value: SUBSCRIPTION_TYPES.bill, label: t('planned.subscriptions.summary.filterBills') },
  { value: SUBSCRIPTION_TYPES.installment, label: t('planned.subscriptions.summary.filterInstallments') },
]);

const { mutate: createSub } = useMutation({
  mutationFn: createSubscription,
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.subscriptionsList });
    queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.subscriptionsSummary });
    queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.widgetSubscriptionsUpcoming });
    isCreateDialogOpen.value = false;
    addSuccessNotification(t('planned.subscriptions.createSuccess'));
  },
  onError(error) {
    const message =
      error instanceof ApiErrorResponseError ? error.data.message : t('planned.subscriptions.createError');
    createFormRef.value?.setError({ error: message ?? '' });
  },
});

const handleToggleActive = async ({ subscription }: { subscription: SubscriptionListItem }) => {
  try {
    await toggleSubscriptionActive({ id: subscription.id, isActive: !subscription.isActive });
    queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.subscriptionsList });
    queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.subscriptionsSummary });
    queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.widgetSubscriptionsUpcoming });
  } catch {
    addErrorNotification(t('planned.subscriptions.toggleError'));
  }
};

const confirmDelete = async () => {
  if (!deleteTarget.value) return;
  try {
    await deleteSubscription({ id: deleteTarget.value.id });
    queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.subscriptionsList });
    queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.subscriptionsSummary });
    queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.widgetSubscriptionsUpcoming });
    addSuccessNotification(t('planned.subscriptions.deleteSuccess'));
  } catch {
    addErrorNotification(t('planned.subscriptions.deleteError'));
  } finally {
    deleteTarget.value = null;
  }
};

// Paused (inactive) items sink into their own section at the bottom; active
// items keep the server-provided due-date order above.
const activeSubscriptions = computed(() => filteredSubscriptions.value.filter((s) => s.isActive));
const pausedSubscriptions = computed(() => filteredSubscriptions.value.filter((s) => !s.isActive));

const navigateToDetail = ({ subscription }: { subscription: SubscriptionListItem }) => {
  router.push({
    name: ROUTES_NAMES.plannedSubscriptionDetails,
    params: { id: subscription.id },
  });
};

// --- Quick mark-paid from the list (scheduled subscriptions that have an open period) ---
const markPaidRef = ref<InstanceType<typeof SubscriptionMarkPaidDialog>>();
const isMarkingPaid = computed(() => markPaidRef.value?.isPending ?? false);

function payPeriod({ subscription }: { subscription: SubscriptionListItem }) {
  if (!subscription.currentPeriod) return;
  markPaidRef.value?.triggerPay({ subscription, periodId: subscription.currentPeriod.id });
}
</script>

<template>
  <div>
    <!-- Page Header -->
    <div class="mb-4 flex flex-wrap items-center justify-between gap-2 sm:mb-6 sm:gap-4">
      <div>
        <h1 class="text-xl font-semibold tracking-tight sm:text-2xl">{{ $t('planned.subscriptions.title') }}</h1>
        <p class="text-muted-foreground mt-1 hidden text-sm sm:block">{{ $t('planned.subscriptions.description') }}</p>
      </div>
      <div class="flex shrink-0 gap-2">
        <Button variant="outline" size="sm" @click="isDiscoverDialogOpen = true">
          <SearchIcon class="size-4" />
          {{ $t('planned.subscriptions.candidates.discover') }}
        </Button>
        <Button size="sm" @click="isCreateDialogOpen = true">
          <PlusIcon class="size-4" />
          {{ $t('planned.subscriptions.addSubscription') }}
        </Button>
      </div>
    </div>

    <!-- Filter Tabs + Period + Sort -->
    <div class="mb-3 flex flex-col gap-3 sm:mb-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
      <PillTabs v-model="activeFilter" :items="filterItems" />
      <div class="flex flex-wrap items-center justify-between gap-2">
        <SubscriptionsPeriodSelector v-model="periodFilter" />
        <SubscriptionsSortSelect v-model="sortBy" />
      </div>
    </div>

    <SubscriptionsSummary :active-filter="activeFilter" class="mb-3 sm:mb-6" />

    <!-- Loading Skeleton -->
    <div v-if="isPlaceholderData" class="divide-border border-border divide-y rounded-lg border">
      <div v-for="i in 5" :key="i" class="flex animate-pulse items-center gap-4 px-4 py-3">
        <div class="bg-muted h-5 w-32 rounded" />
        <div class="bg-muted h-4 w-16 rounded-full" />
        <div class="bg-muted h-4 w-20 rounded" />
        <div class="bg-muted ml-auto h-4 w-24 rounded" />
      </div>
    </div>

    <!-- Subscription List -->
    <template v-else-if="filteredSubscriptions.length">
      <!-- Active -->
      <div v-if="activeSubscriptions.length" class="divide-border border-border @container divide-y rounded-lg border">
        <SubscriptionRow
          v-for="subscription in activeSubscriptions"
          :key="subscription.id"
          :subscription="subscription"
          :is-marking-paid="isMarkingPaid"
          @select="navigateToDetail({ subscription: $event })"
          @pay="payPeriod({ subscription: $event })"
          @toggle-active="handleToggleActive({ subscription: $event })"
          @delete="deleteTarget = $event"
        />
      </div>

      <!-- Paused (inactive) -->
      <div v-if="pausedSubscriptions.length" class="mt-6">
        <h2 class="text-muted-foreground mb-2 px-1 text-xs font-medium tracking-wide uppercase">
          {{ $t('planned.subscriptions.pausedSection', { count: pausedSubscriptions.length }) }}
        </h2>
        <div class="divide-border border-border @container divide-y rounded-lg border">
          <SubscriptionRow
            v-for="subscription in pausedSubscriptions"
            :key="subscription.id"
            :subscription="subscription"
            :is-marking-paid="isMarkingPaid"
            @select="navigateToDetail({ subscription: $event })"
            @pay="payPeriod({ subscription: $event })"
            @toggle-active="handleToggleActive({ subscription: $event })"
            @delete="deleteTarget = $event"
          />
        </div>
      </div>
    </template>

    <!-- Empty State -->
    <div v-else class="flex flex-col items-center justify-center py-12 text-center">
      <div class="bg-muted mb-4 flex size-16 items-center justify-center rounded-full">
        <RepeatIcon class="text-muted-foreground size-8" />
      </div>
      <h3 class="mb-1 font-medium">{{ $t('planned.subscriptions.emptyState.title') }}</h3>
      <p class="text-muted-foreground max-w-sm text-sm">
        {{ $t('planned.subscriptions.emptyState.description') }}
      </p>
      <Button class="mt-4" @click="isCreateDialogOpen = true">
        <PlusIcon class="mr-2 size-4" />
        {{ $t('planned.subscriptions.addSubscription') }}
      </Button>
    </div>

    <!-- Create Dialog -->
    <ResponsiveDialog v-model:open="isCreateDialogOpen" dialog-content-class="max-w-lg">
      <template #title>{{ $t('planned.subscriptions.createTitle') }}</template>
      <SubscriptionFormDialog
        ref="createFormRef"
        form-id="create-subscription-form"
        @submit="createSub"
        @cancel="isCreateDialogOpen = false"
      />
      <template #footer>
        <div class="flex justify-end gap-2">
          <Button variant="outline" type="button" @click="isCreateDialogOpen = false">
            {{ $t('planned.subscriptions.cancel') }}
          </Button>
          <Button type="submit" form="create-subscription-form" :disabled="createFormRef?.isSubmitDisabled">
            {{ $t('planned.subscriptions.form.create') }}
          </Button>
        </div>
      </template>
    </ResponsiveDialog>

    <!-- Delete Confirmation -->
    <ResponsiveAlertDialog
      :open="!!deleteTarget"
      confirm-variant="destructive"
      :confirm-label="$t('planned.subscriptions.deleteConfirm')"
      @confirm="confirmDelete"
      @cancel="deleteTarget = null"
      @update:open="(v: boolean) => !v && (deleteTarget = null)"
    >
      <template #title>{{ $t('planned.subscriptions.deleteConfirmTitle') }}</template>
      <template #description>{{ $t('planned.subscriptions.deleteConfirmDescription') }}</template>
    </ResponsiveAlertDialog>

    <!-- Discover Candidates Dialog -->
    <DiscoverCandidatesDialog v-model:open="isDiscoverDialogOpen" />

    <!-- Quick mark-paid flow (books instantly for same-currency, opens dialog for cross-currency) -->
    <SubscriptionMarkPaidDialog ref="markPaidRef" />
  </div>
</template>
