<script setup lang="ts">
import {
  deleteSubscription,
  linkTransactionsToSubscription,
  loadSubscriptionById,
  loadSuggestedMatches,
  toggleSubscriptionActive,
  unlinkTransactionsFromSubscription,
  updateSubscription,
} from '@/api/subscriptions';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import ResponsiveAlertDialog from '@/components/common/responsive-alert-dialog.vue';
import ResponsiveDialog from '@/components/common/responsive-dialog.vue';
import Button from '@/components/lib/ui/button/Button.vue';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/lib/ui/popover';
import { useNotificationCenter } from '@/components/notification-center';
import TransactionRecord from '@/components/transactions-list/transaction-record.vue';
import { useFormatCurrency } from '@/composable/formatters';
import { ApiErrorResponseError } from '@/js/errors';
import { ROUTES_NAMES } from '@/routes';
import {
  SUBSCRIPTION_MATCH_SOURCE,
  type SubscriptionModel,
  type TransactionModel,
} from '@bt/shared/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { format } from 'date-fns';
import {
  CirclePauseIcon,
  EditIcon,
  EllipsisVerticalIcon,
  LinkIcon,
  RepeatIcon,
  SearchIcon,
  SettingsIcon,
  Trash2Icon,
  UnlinkIcon,
} from 'lucide-vue-next';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';

import SubscriptionFormDialog from './components/subscription-form-dialog.vue';
import SubscriptionTypeBadge from './components/subscription-type-badge.vue';
import { formatFrequency, formatMatchSource } from './utils';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const queryClient = useQueryClient();
const { addSuccessNotification, addErrorNotification } = useNotificationCenter();
const { formatAmountByCurrencyCode } = useFormatCurrency();

const subscriptionId = computed(() => route.params.id as string);

const {
  data: subscription,
  isLoading,
  isError,
} = useQuery({
  queryFn: () => loadSubscriptionById({ id: subscriptionId.value }),
  queryKey: [...VUE_QUERY_CACHE_KEYS.subscriptionDetails, subscriptionId],
  staleTime: Infinity,
  retry: false,
});

watch(isError, (errored) => {
  if (errored) {
    addErrorNotification(t('planned.subscriptions.notFound'));
    router.replace({ name: ROUTES_NAMES.plannedSubscriptions });
  }
});

const isActionsOpen = ref(false);
const isEditDialogOpen = ref(false);
const editFormRef = ref<InstanceType<typeof SubscriptionFormDialog> | null>(null);
const isDeleteDialogOpen = ref(false);
const isSuggestDialogOpen = ref(false);
const suggestedMatches = ref<TransactionModel[]>([]);
const selectedSuggestionIds = ref<Set<number>>(new Set());
const isSuggestLoading = ref(false);

const invalidateQueries = () => {
  queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.subscriptionDetails });
  queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.subscriptionsList });
};

const { mutate: updateSub } = useMutation({
  mutationFn: ({
    payload,
  }: {
    payload: Partial<Omit<SubscriptionModel, 'id' | 'userId' | 'createdAt' | 'updatedAt'>>;
  }) => updateSubscription({ id: subscriptionId.value, payload }),
  onSuccess: () => {
    invalidateQueries();
    isEditDialogOpen.value = false;
    addSuccessNotification(t('planned.subscriptions.updateSuccess'));
  },
  onError(error) {
    const message = error instanceof ApiErrorResponseError
      ? error.data.message
      : t('planned.subscriptions.updateError');
    editFormRef.value?.setError({ error: message });
  },
});

const handleToggleActive = async () => {
  if (!subscription.value) return;
  try {
    await toggleSubscriptionActive({ id: subscriptionId.value, isActive: !subscription.value.isActive });
    invalidateQueries();
  } catch {
    addErrorNotification(t('planned.subscriptions.toggleError'));
  }
};

const handleDelete = async () => {
  try {
    await deleteSubscription({ id: subscriptionId.value });
    queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.subscriptionsList });
    addSuccessNotification(t('planned.subscriptions.deleteSuccess'));
    router.push({ name: ROUTES_NAMES.plannedSubscriptions });
  } catch {
    addErrorNotification(t('planned.subscriptions.deleteError'));
  } finally {
    isDeleteDialogOpen.value = false;
  }
};

const handleUnlinkTransaction = async ({ transactionId }: { transactionId: number }) => {
  try {
    await unlinkTransactionsFromSubscription({ id: subscriptionId.value, transactionIds: [transactionId] });
    invalidateQueries();
    addSuccessNotification(t('planned.subscriptions.unlinkSuccess'));
  } catch {
    addErrorNotification(t('planned.subscriptions.unlinkError'));
  }
};

const handleSuggestMatches = async () => {
  isSuggestLoading.value = true;
  try {
    suggestedMatches.value = await loadSuggestedMatches({ id: subscriptionId.value });
    selectedSuggestionIds.value = new Set();
    isSuggestDialogOpen.value = true;
  } catch {
    addErrorNotification(t('planned.subscriptions.suggestError'));
  } finally {
    isSuggestLoading.value = false;
  }
};

const toggleSuggestionSelection = ({ transactionId }: { transactionId: number }) => {
  const newSet = new Set(selectedSuggestionIds.value);
  if (newSet.has(transactionId)) {
    newSet.delete(transactionId);
  } else {
    newSet.add(transactionId);
  }
  selectedSuggestionIds.value = newSet;
};

const handleLinkSelected = async () => {
  if (selectedSuggestionIds.value.size === 0) return;
  try {
    await linkTransactionsToSubscription({
      id: subscriptionId.value,
      transactionIds: Array.from(selectedSuggestionIds.value),
    });
    invalidateQueries();
    isSuggestDialogOpen.value = false;
    addSuccessNotification(t('planned.subscriptions.linkSuccess'));
  } catch {
    addErrorNotification(t('planned.subscriptions.linkError'));
  }
};

const hasMatchingRules = computed(() => {
  return (subscription.value?.matchingRules?.rules?.length ?? 0) > 0;
});

const MATCH_SOURCE_CLASSES: Record<string, string> = {
  [SUBSCRIPTION_MATCH_SOURCE.rule]: 'bg-green-500/10 text-green-600 dark:text-green-400',
  [SUBSCRIPTION_MATCH_SOURCE.ai]: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
};

const getMatchSourceClass = ({ source }: { source: string }): string =>
  MATCH_SOURCE_CLASSES[source] ?? 'bg-muted text-muted-foreground';
</script>

<template>
  <!-- Loading -->
  <div v-if="isLoading" class="animate-pulse">
    <div class="bg-muted mb-4 h-8 w-1/3 rounded" />
    <div class="bg-muted mb-2 h-5 w-2/3 rounded" />
    <div class="bg-muted mb-6 h-5 w-1/2 rounded" />
    <div class="bg-muted h-40 rounded-lg" />
  </div>

  <div v-else-if="subscription">
    <!-- Header -->
    <div class="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <div class="flex items-center gap-3">
          <h1 class="text-2xl font-semibold tracking-tight">{{ subscription.name }}</h1>
          <SubscriptionTypeBadge :type="subscription.type" size="md" />
          <span
            v-if="!subscription.isActive"
            class="bg-muted text-muted-foreground inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs"
          >
            <CirclePauseIcon class="size-3" />
            {{ $t('planned.subscriptions.paused') }}
          </span>
        </div>
        <p v-if="subscription.notes" class="text-muted-foreground mt-1 text-sm">{{ subscription.notes }}</p>
      </div>

      <!-- Desktop actions -->
      <div class="hidden items-center gap-2 lg:flex">
        <Button variant="outline" size="sm" @click="isEditDialogOpen = true">
          <EditIcon class="mr-1.5 size-4" />
          {{ $t('planned.subscriptions.edit') }}
        </Button>
        <Button variant="outline" size="sm" @click="handleToggleActive">
          <CirclePauseIcon v-if="subscription.isActive" class="mr-1.5 size-4" />
          <RepeatIcon v-else class="mr-1.5 size-4" />
          {{
            subscription.isActive
              ? $t('planned.subscriptions.pauseSubscription')
              : $t('planned.subscriptions.resumeSubscription')
          }}
        </Button>
        <Button variant="destructive" size="sm" @click="isDeleteDialogOpen = true">
          <Trash2Icon class="mr-1.5 size-4" />
          {{ $t('planned.subscriptions.deleteSubscription') }}
        </Button>
      </div>

      <!-- Mobile/tablet actions dropdown -->
      <Popover v-model:open="isActionsOpen">
        <PopoverTrigger as-child class="lg:hidden">
          <Button variant="outline" size="icon-sm">
            <EllipsisVerticalIcon class="size-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" class="flex w-auto min-w-48 flex-col gap-1 p-1">
          <Button
            variant="ghost"
            size="sm"
            class="w-full justify-start"
            @click="isActionsOpen = false; isEditDialogOpen = true"
          >
            <EditIcon class="size-4" />
            {{ $t('planned.subscriptions.edit') }}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            class="w-full justify-start"
            @click="isActionsOpen = false; handleToggleActive()"
          >
            <CirclePauseIcon v-if="subscription.isActive" class="size-4" />
            <RepeatIcon v-else class="size-4" />
            {{
              subscription.isActive
                ? $t('planned.subscriptions.pauseSubscription')
                : $t('planned.subscriptions.resumeSubscription')
            }}
          </Button>
          <Button
            variant="ghost-destructive"
            size="sm"
            class="w-full justify-start"
            @click="isActionsOpen = false; isDeleteDialogOpen = true"
          >
            <Trash2Icon class="size-4" />
            {{ $t('planned.subscriptions.deleteSubscription') }}
          </Button>
        </PopoverContent>
      </Popover>
    </div>

    <div class="border-border mb-6 grid grid-cols-2 gap-4 rounded-lg border p-4 sm:grid-cols-3 lg:grid-cols-5">
      <div>
        <p class="text-muted-foreground text-xs font-medium uppercase">{{ $t('planned.subscriptions.amount') }}</p>
        <p class="mt-1 text-sm font-medium">
          {{
            subscription.expectedAmount && subscription.expectedCurrencyCode
              ? formatAmountByCurrencyCode(subscription.expectedAmount, subscription.expectedCurrencyCode)
              : '—'
          }}
        </p>
      </div>
      <div>
        <p class="text-muted-foreground text-xs font-medium uppercase">
          {{ $t('planned.subscriptions.frequencyLabel') }}
        </p>
        <p class="mt-1 text-sm font-medium">{{ formatFrequency({ frequency: subscription.frequency, t }) }}</p>
      </div>
      <div>
        <p class="text-muted-foreground text-xs font-medium uppercase">
          {{ $t('planned.subscriptions.nextExpected') }}
        </p>
        <p class="mt-1 text-sm font-medium">
          {{ subscription.nextExpectedDate ? format(new Date(subscription.nextExpectedDate), 'MMM d, yyyy') : '—' }}
        </p>
      </div>
      <div>
        <p class="text-muted-foreground text-xs font-medium uppercase">{{ $t('planned.subscriptions.startDate') }}</p>
        <p class="mt-1 text-sm font-medium">{{ format(new Date(subscription.startDate), 'MMM d, yyyy') }}</p>
      </div>
      <div>
        <p class="text-muted-foreground text-xs font-medium uppercase">
          {{ $t('planned.subscriptions.matchingRulesTitle') }}
        </p>
        <p class="mt-1 text-sm font-medium">
          {{
            hasMatchingRules
              ? $t('planned.subscriptions.form.rulesCount', { count: subscription.matchingRules.rules.length })
              : '—'
          }}
        </p>
        <Button type="button" variant="link" size="sm" class="h-auto p-0 text-xs" @click="isEditDialogOpen = true">
          {{
            hasMatchingRules
              ? $t('planned.subscriptions.updateMatchingRules')
              : $t('planned.subscriptions.addMatchingRules')
          }}
        </Button>
      </div>
    </div>

    <!-- Category + Account -->
    <div
      v-if="subscription.category || subscription.account"
      class="text-muted-foreground mb-6 flex items-center gap-4 text-sm"
    >
      <span v-if="subscription.category" class="flex items-center gap-1.5">
        <span class="inline-block size-3 rounded-full" :style="{ backgroundColor: subscription.category.color }" />
        {{ subscription.category.name }}
      </span>
      <span v-if="subscription.account">
        {{ subscription.account.name }} ({{ subscription.account.currencyCode }})
      </span>
    </div>

    <!-- Linked Transactions -->
    <div class="mb-4 flex flex-wrap items-center justify-between gap-2">
      <h2 class="text-lg font-semibold">{{ $t('planned.subscriptions.linkedTransactionsTitle') }}</h2>
      <Button variant="outline" size="sm" :disabled="isSuggestLoading" @click="handleSuggestMatches">
        <SearchIcon class="mr-1.5 size-4" />
        {{ $t('planned.subscriptions.suggestMatches') }}
      </Button>
    </div>

    <div v-if="subscription.transactions?.length" class="border-border rounded-lg border">
      <div
        v-for="tx in subscription.transactions"
        :key="tx.id"
        class="border-border flex items-center gap-2 border-b px-2 last:border-b-0"
      >
        <TransactionRecord :tx="tx" :as-button="false" class="flex-1" @record-click="() => {}" />
        <div class="flex shrink-0 items-center gap-1">
          <span
            :class="[
              'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium',
              getMatchSourceClass({ source: tx.SubscriptionTransactions.matchSource }),
            ]"
          >
            {{ formatMatchSource({ source: tx.SubscriptionTransactions.matchSource, t }) }}
          </span>
          <Button
            variant="ghost"
            size="icon"
            class="size-7"
            :title="$t('planned.subscriptions.unlinkTransaction')"
            @click="handleUnlinkTransaction({ transactionId: tx.id })"
          >
            <UnlinkIcon class="size-3.5" />
          </Button>
        </div>
      </div>
    </div>

    <div v-else class="border-border rounded-lg border p-8 text-center">
      <LinkIcon class="text-muted-foreground mx-auto mb-2 size-8 opacity-50" />
      <p class="text-muted-foreground text-sm">{{ $t('planned.subscriptions.noLinkedTransactions') }}</p>
      <Button
        v-if="!hasMatchingRules"
        type="button"
        variant="outline"
        size="sm"
        class="mt-3"
        @click="isEditDialogOpen = true"
      >
        <SettingsIcon class="mr-1.5 size-4" />
        {{ $t('planned.subscriptions.addMatchingRules') }}
      </Button>
    </div>

    <!-- Edit Dialog -->
    <ResponsiveDialog v-model:open="isEditDialogOpen" dialog-content-class="max-w-lg">
      <template #title>{{ $t('planned.subscriptions.editTitle') }}</template>
      <SubscriptionFormDialog
        ref="editFormRef"
        form-id="edit-subscription-form"
        :initial-values="subscription"
        @submit="(payload) => updateSub({ payload })"
        @cancel="isEditDialogOpen = false"
      />
      <template #footer>
        <div class="flex justify-end gap-2">
          <Button variant="outline" type="button" @click="isEditDialogOpen = false">
            {{ $t('planned.subscriptions.cancel') }}
          </Button>
          <Button type="submit" form="edit-subscription-form" :disabled="editFormRef?.isSubmitDisabled">
            {{ $t('planned.subscriptions.form.update') }}
          </Button>
        </div>
      </template>
    </ResponsiveDialog>

    <!-- Delete Confirmation -->
    <ResponsiveAlertDialog
      v-model:open="isDeleteDialogOpen"
      confirm-variant="destructive"
      :confirm-label="$t('planned.subscriptions.deleteConfirm')"
      @confirm="handleDelete"
      @cancel="isDeleteDialogOpen = false"
    >
      <template #title>{{ $t('planned.subscriptions.deleteConfirmTitle') }}</template>
      <template #description>{{ $t('planned.subscriptions.deleteConfirmDescription') }}</template>
    </ResponsiveAlertDialog>

    <!-- Suggest Matches Dialog -->
    <ResponsiveDialog v-model:open="isSuggestDialogOpen" dialog-content-class="max-w-2xl max-h-[80vh]">
      <template #title>{{ $t('planned.subscriptions.suggestMatchesTitle') }}</template>
      <template #description>{{ $t('planned.subscriptions.suggestMatchesDescription') }}</template>

      <div v-if="suggestedMatches.length" class="max-h-[50vh] overflow-y-auto">
        <div class="divide-border divide-y">
          <TransactionRecord
            v-for="(tx, i) in suggestedMatches"
            :key="tx.id"
            :tx="tx"
            :as-button="false"
            show-checkbox
            :is-selected="selectedSuggestionIds.has(tx.id)"
            :index="i"
            @selection-change="({ id }) => toggleSuggestionSelection({ transactionId: id })"
            @record-click="() => toggleSuggestionSelection({ transactionId: tx.id })"
          />
        </div>
      </div>

      <div v-else class="py-8 text-center">
        <p class="text-muted-foreground text-sm">{{ $t('planned.subscriptions.noSuggestedMatches') }}</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          class="mt-3"
          @click="
            isSuggestDialogOpen = false;
            isEditDialogOpen = true;
          "
        >
          <SettingsIcon class="mr-1.5 size-4" />
          {{
            hasMatchingRules
              ? $t('planned.subscriptions.updateMatchingRules')
              : $t('planned.subscriptions.addMatchingRules')
          }}
        </Button>
      </div>

      <template #footer>
        <div class="flex justify-end gap-2">
          <Button variant="outline" @click="isSuggestDialogOpen = false">
            {{ $t('planned.subscriptions.cancel') }}
          </Button>
          <Button :disabled="selectedSuggestionIds.size === 0" @click="handleLinkSelected">
            <LinkIcon class="mr-1.5 size-4" />
            {{ $t('planned.subscriptions.linkSelected', { count: selectedSuggestionIds.size }) }}
          </Button>
        </div>
      </template>
    </ResponsiveDialog>
  </div>
</template>
