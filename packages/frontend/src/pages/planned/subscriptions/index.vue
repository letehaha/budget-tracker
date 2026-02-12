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
import Tabs from '@/components/lib/ui/tabs/Tabs.vue';
import TabsList from '@/components/lib/ui/tabs/TabsList.vue';
import TabsTrigger from '@/components/lib/ui/tabs/TabsTrigger.vue';
import { useNotificationCenter } from '@/components/notification-center';
import { useFormatCurrency } from '@/composable/formatters';
import { ApiErrorResponseError } from '@/js/errors';
import { cn } from '@/lib/utils';
import { ROUTES_NAMES } from '@/routes';
import { SUBSCRIPTION_TYPES } from '@bt/shared/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { CirclePauseIcon, PlusIcon, RepeatIcon, SearchIcon, Trash2Icon } from 'lucide-vue-next';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';

import DiscoverCandidatesDialog from './components/discover-candidates-dialog.vue';
import SubscriptionFormDialog from './components/subscription-form-dialog.vue';
import SubscriptionServiceLogo from './components/subscription-service-logo.vue';
import SubscriptionTypeBadge from './components/subscription-type-badge.vue';
import SubscriptionsSummary from './components/subscriptions-summary.vue';
import { formatFrequency } from './utils';

const { t } = useI18n();
const router = useRouter();
const queryClient = useQueryClient();
const { addSuccessNotification, addErrorNotification } = useNotificationCenter();
const { formatAmountByCurrencyCode } = useFormatCurrency();

const isCreateDialogOpen = ref(false);
const isDiscoverDialogOpen = ref(false);
const createFormRef = ref<InstanceType<typeof SubscriptionFormDialog> | null>(null);
const deleteTarget = ref<SubscriptionListItem | null>(null);
const activeFilter = ref<string>('all');

const { data: subscriptions, isPlaceholderData } = useQuery({
  queryFn: () => loadSubscriptions(),
  queryKey: VUE_QUERY_CACHE_KEYS.subscriptionsList,
  staleTime: Infinity,
  placeholderData: [],
});

const filteredSubscriptions = computed(() => {
  if (!subscriptions.value) return [];
  if (activeFilter.value === 'all') return subscriptions.value;
  return subscriptions.value.filter((s) => s.type === activeFilter.value);
});

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
    createFormRef.value?.setError({ error: message });
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

const navigateToDetail = ({ subscription }: { subscription: SubscriptionListItem }) => {
  router.push({
    name: ROUTES_NAMES.plannedSubscriptionDetails,
    params: { id: subscription.id },
  });
};

const formatAmount = ({ subscription }: { subscription: SubscriptionListItem }): string | null => {
  if (!subscription.expectedAmount || !subscription.expectedCurrencyCode) return null;
  return formatAmountByCurrencyCode(subscription.expectedAmount, subscription.expectedCurrencyCode);
};
</script>

<template>
  <div>
    <!-- Page Header -->
    <div class="mb-4 flex items-center justify-between gap-2 sm:mb-6 sm:gap-4">
      <div>
        <h1 class="text-xl font-semibold tracking-tight sm:text-2xl">{{ $t('planned.subscriptions.title') }}</h1>
        <p class="text-muted-foreground mt-1 hidden text-sm sm:block">{{ $t('planned.subscriptions.description') }}</p>
      </div>
      <div class="flex shrink-0 gap-2">
        <Button variant="outline" size="sm" @click="isDiscoverDialogOpen = true">
          <SearchIcon class="mr-1 size-4 sm:mr-2" />
          {{ $t('planned.subscriptions.candidates.discover') }}
        </Button>
        <Button size="sm" @click="isCreateDialogOpen = true">
          <PlusIcon class="mr-1 size-4 sm:mr-2" />
          {{ $t('planned.subscriptions.addSubscription') }}
        </Button>
      </div>
    </div>

    <!-- Filter Tabs -->
    <Tabs v-model="activeFilter" default-value="all" class="mb-3 sm:mb-4">
      <TabsList>
        <TabsTrigger value="all">{{ $t('planned.subscriptions.summary.filterAll') }}</TabsTrigger>
        <TabsTrigger :value="SUBSCRIPTION_TYPES.subscription">{{
          $t('planned.subscriptions.summary.filterSubscriptions')
        }}</TabsTrigger>
        <TabsTrigger :value="SUBSCRIPTION_TYPES.bill">{{
          $t('planned.subscriptions.summary.filterBills')
        }}</TabsTrigger>
      </TabsList>
    </Tabs>

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
    <div
      v-else-if="filteredSubscriptions.length"
      class="divide-border border-border @container divide-y rounded-lg border"
    >
      <div
        v-for="subscription in filteredSubscriptions"
        :key="subscription.id"
        :class="
          cn(
            'hover:bg-accent/50 grid cursor-pointer grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 px-4 py-3 transition-colors @[600px]:flex',
            !subscription.isActive && 'opacity-60',
          )
        "
        @click="navigateToDetail({ subscription })"
      >
        <!-- Name -->
        <div class="flex min-w-0 items-center gap-2">
          <SubscriptionServiceLogo :name="subscription.name" size="sm" />
          <h3 class="min-w-0 truncate font-medium">{{ subscription.name }}</h3>
        </div>

        <!-- Type badge -->
        <div class="flex shrink-0 items-center justify-end gap-1.5">
          <SubscriptionTypeBadge :type="subscription.type" />
          <span
            v-if="!subscription.isActive"
            class="bg-muted text-muted-foreground inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs"
          >
            <CirclePauseIcon class="size-3" />
            {{ $t('planned.subscriptions.paused') }}
          </span>
        </div>

        <!-- Amount + Frequency -->
        <div class="text-muted-foreground flex shrink-0 items-center gap-2 text-sm">
          <span v-if="formatAmount({ subscription })" class="text-foreground font-medium">
            {{ formatAmount({ subscription }) }}
          </span>
          <span class="flex items-center gap-1">
            <RepeatIcon class="size-3.5" />
            {{ formatFrequency({ frequency: subscription.frequency, t }) }}
          </span>
        </div>

        <!-- Category -->
        <span
          v-if="subscription.category"
          class="text-muted-foreground hidden shrink-0 items-center gap-1 text-xs @[600px]:flex"
        >
          <span class="inline-block size-2.5 rounded-full" :style="{ backgroundColor: subscription.category.color }" />
          {{ subscription.category.name }}
        </span>

        <!-- Right side: linked txs + actions -->
        <div class="ml-auto flex shrink-0 items-center gap-2">
          <span class="text-muted-foreground hidden text-xs @[600px]:inline">
            {{ $t('planned.subscriptions.linkedTransactions', { count: subscription.linkedTransactionsCount }) }}
          </span>

          <div class="flex items-center gap-1" @click.stop>
            <Button
              variant="ghost"
              size="icon-sm"
              :title="
                subscription.isActive
                  ? $t('planned.subscriptions.pauseSubscription')
                  : $t('planned.subscriptions.resumeSubscription')
              "
              @click="handleToggleActive({ subscription })"
            >
              <CirclePauseIcon v-if="subscription.isActive" class="size-4" />
              <RepeatIcon v-else class="size-4" />
            </Button>
            <Button
              variant="ghost-destructive"
              size="icon-sm"
              :title="$t('planned.subscriptions.deleteSubscription')"
              @click="deleteTarget = subscription"
            >
              <Trash2Icon class="size-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>

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
  </div>
</template>
