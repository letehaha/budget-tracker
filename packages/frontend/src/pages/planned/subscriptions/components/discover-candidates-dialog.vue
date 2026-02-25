<script setup lang="ts">
import {
  type SubscriptionCandidate,
  acceptSubscriptionCandidate,
  detectSubscriptionCandidates,
  dismissSubscriptionCandidate,
} from '@/api/subscription-candidates';
import { createSubscription } from '@/api/subscriptions';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import ResponsiveDialog from '@/components/common/responsive-dialog.vue';
import Button from '@/components/lib/ui/button/Button.vue';
import { useNotificationCenter } from '@/components/notification-center';
import { ApiErrorResponseError } from '@/js/errors';
import { SUBSCRIPTION_TYPES, type SubscriptionModel } from '@bt/shared/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { formatDistanceToNow } from 'date-fns';
import { SearchIcon } from 'lucide-vue-next';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

import CandidateCard from './candidate-card.vue';
import CandidateTransactionsDialog from './candidate-transactions-dialog.vue';
import SubscriptionFormDialog from './subscription-form-dialog.vue';

const props = defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  'update:open': [value: boolean];
}>();

const { t } = useI18n();
const queryClient = useQueryClient();
const { addSuccessNotification, addErrorNotification } = useNotificationCenter();

const isCreateDialogOpen = ref(false);
const createFormRef = ref<InstanceType<typeof SubscriptionFormDialog> | null>(null);
const prefillValues = ref<SubscriptionModel | null>(null);
// Track which candidate is being accepted so we can mark it after subscription creation
const pendingAcceptCandidateId = ref<string | null>(null);
const linkingId = ref<string | null>(null);
const isTransactionsDialogOpen = ref(false);
const previewTransactionIds = ref<number[]>([]);

const {
  data: detectionResult,
  isLoading,
  isFetching,
} = useQuery({
  queryFn: detectSubscriptionCandidates,
  queryKey: VUE_QUERY_CACHE_KEYS.subscriptionCandidates,
  enabled: computed(() => props.open),
  staleTime: 5 * 60 * 1000,
});

const candidates = computed(() => detectionResult.value?.candidates ?? []);
const activeCandidates = computed(() => candidates.value.filter((c) => !c.isOutdated));
const outdatedCandidates = computed(() => candidates.value.filter((c) => c.isOutdated));
const lastRunAt = computed(() => detectionResult.value?.lastRunAt ?? null);
const isFromCache = computed(() => detectionResult.value?.isFromCache ?? false);

const lastRunLabel = computed(() => {
  if (!lastRunAt.value) return null;
  return formatDistanceToNow(new Date(lastRunAt.value), { addSuffix: true });
});

const { mutate: doDismiss, isPending: isDismissing } = useMutation({
  mutationFn: dismissSubscriptionCandidate,
  onSuccess() {
    queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.subscriptionCandidates });
    addSuccessNotification(t('planned.subscriptions.candidates.dismissed'));
  },
  onError() {
    addErrorNotification(t('planned.subscriptions.candidates.dismissError'));
  },
});

const { mutate: doLink, isPending: isLinking } = useMutation({
  mutationFn: acceptSubscriptionCandidate,
  onSuccess() {
    queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.subscriptionCandidates });
    queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.subscriptionsList });
    queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.subscriptionsSummary });
    queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.widgetSubscriptionsUpcoming });
    addSuccessNotification(t('planned.subscriptions.candidates.linkSuccess'));
    linkingId.value = null;
  },
  onError() {
    addErrorNotification(t('planned.subscriptions.candidates.linkError'));
    linkingId.value = null;
  },
});

/**
 * Issue 1 fix: Don't call accept API yet. Just open the form pre-filled
 * with candidate data. Accept will be called after subscription creation.
 */
const handleAccept = ({ candidate }: { candidate: SubscriptionCandidate }) => {
  pendingAcceptCandidateId.value = candidate.id;
  prefillValues.value = {
    id: '',
    userId: 0,
    name: candidate.suggestedName,
    type: SUBSCRIPTION_TYPES.subscription,
    expectedAmount: candidate.averageAmount,
    expectedCurrencyCode: candidate.currencyCode,
    frequency: candidate.detectedFrequency,
    startDate: new Date().toISOString().split('T')[0]!,
    endDate: null,
    accountId: candidate.accountId,
    categoryId: null,
    matchingRules: {
      rules: [
        {
          field: 'note',
          operator: 'contains_any',
          value: [candidate.suggestedName],
        },
      ],
    },
    isActive: true,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  isCreateDialogOpen.value = true;
};

const handleDismiss = ({ candidate }: { candidate: SubscriptionCandidate }) => {
  doDismiss({ id: candidate.id });
};

const handleViewTransactions = ({ transactionIds }: { transactionIds: number[] }) => {
  previewTransactionIds.value = transactionIds;
  isTransactionsDialogOpen.value = true;
};

const handleLink = ({ candidate }: { candidate: SubscriptionCandidate }) => {
  if (!candidate.possibleMatch) return;
  linkingId.value = candidate.id;
  doLink({ id: candidate.id, subscriptionId: candidate.possibleMatch.id });
};

const { mutate: createSub } = useMutation({
  mutationFn: createSubscription,
  onSuccess: (createdSubscription) => {
    queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.subscriptionsList });
    queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.subscriptionsSummary });
    queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.widgetSubscriptionsUpcoming });
    isCreateDialogOpen.value = false;
    prefillValues.value = null;
    addSuccessNotification(t('planned.subscriptions.createSuccess'));

    // Now mark the candidate as accepted and link its sample transactions (fire-and-forget)
    if (pendingAcceptCandidateId.value) {
      acceptSubscriptionCandidate({
        id: pendingAcceptCandidateId.value,
        subscriptionId: createdSubscription.id,
      })
        .then(() => {
          queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.subscriptionCandidates });
        })
        .catch(() => {
          // Candidate accept failed, but subscription was created — not critical
        });
      pendingAcceptCandidateId.value = null;
    }
  },
  onError(error) {
    const message =
      error instanceof ApiErrorResponseError ? error.data.message : t('planned.subscriptions.createError');
    createFormRef.value?.setError({ error: message ?? '' });
  },
});

const handleCreateDialogClose = (open: boolean) => {
  isCreateDialogOpen.value = open;
  if (!open) {
    // User closed form without creating — clear pending accept
    pendingAcceptCandidateId.value = null;
    prefillValues.value = null;
  }
};
</script>

<template>
  <ResponsiveDialog :open="open" dialog-content-class="max-w-lg" @update:open="emit('update:open', $event)">
    <template #title>{{ t('planned.subscriptions.candidates.title') }}</template>
    <template #description>
      {{ t('planned.subscriptions.candidates.description') }}
    </template>

    <div class="min-h-50">
      <!-- Last scanned indicator -->
      <p v-if="isFromCache && lastRunLabel" class="text-muted-foreground mb-3 text-xs">
        {{ t('planned.subscriptions.candidates.lastScanned', { time: lastRunLabel }) }}
      </p>

      <!-- Loading skeleton -->
      <div v-if="isLoading || isFetching" class="space-y-3">
        <div v-for="i in 3" :key="i" class="border-border animate-pulse rounded-lg border p-4">
          <div class="mb-2 flex items-start justify-between">
            <div class="space-y-2">
              <div class="bg-muted h-5 w-40 rounded" />
              <div class="bg-muted h-4 w-56 rounded" />
            </div>
            <div class="bg-muted h-5 w-12 rounded-full" />
          </div>
          <div class="mt-3 flex gap-2">
            <div class="bg-muted h-8 flex-1 rounded" />
            <div class="bg-muted h-8 flex-1 rounded" />
          </div>
        </div>
      </div>

      <!-- Candidates list -->
      <div v-else-if="candidates.length" class="space-y-3">
        <!-- Active candidates -->
        <CandidateCard
          v-for="candidate in activeCandidates"
          :key="candidate.id"
          :candidate="candidate"
          :is-accepting="false"
          :is-dismissing="isDismissing"
          :is-linking="isLinking && linkingId === candidate.id"
          @accept="handleAccept({ candidate: $event })"
          @dismiss="handleDismiss({ candidate: $event })"
          @link="handleLink({ candidate: $event })"
          @view-transactions="handleViewTransactions({ transactionIds: $event })"
        />

        <!-- Outdated candidates section -->
        <template v-if="outdatedCandidates.length">
          <div class="border-border border-t pt-3">
            <p class="text-muted-foreground mb-3 text-xs">
              {{ t('planned.subscriptions.candidates.outdatedWarning') }}
            </p>
            <div class="space-y-3">
              <CandidateCard
                v-for="candidate in outdatedCandidates"
                :key="candidate.id"
                :candidate="candidate"
                :is-accepting="false"
                :is-dismissing="isDismissing"
                :is-linking="isLinking && linkingId === candidate.id"
                @accept="handleAccept({ candidate: $event })"
                @dismiss="handleDismiss({ candidate: $event })"
                @link="handleLink({ candidate: $event })"
                @view-transactions="handleViewTransactions({ transactionIds: $event })"
              />
            </div>
          </div>
        </template>
      </div>

      <!-- Empty state -->
      <div v-else class="flex flex-col items-center justify-center py-8 text-center">
        <div class="bg-muted mb-3 flex size-12 items-center justify-center rounded-full">
          <SearchIcon class="text-muted-foreground size-6" />
        </div>
        <h4 class="mb-1 font-medium">{{ t('planned.subscriptions.candidates.emptyTitle') }}</h4>
        <p class="text-muted-foreground max-w-xs text-sm">
          {{ t('planned.subscriptions.candidates.emptyDescription') }}
        </p>
      </div>
    </div>

    <template #footer>
      <div class="flex justify-end">
        <Button variant="outline" @click="emit('update:open', false)">
          {{ t('planned.subscriptions.candidates.close') }}
        </Button>
      </div>
    </template>
  </ResponsiveDialog>

  <!-- Create subscription dialog (pre-filled from accepted candidate) -->
  <ResponsiveDialog :open="isCreateDialogOpen" dialog-content-class="max-w-lg" @update:open="handleCreateDialogClose">
    <template #title>{{ t('planned.subscriptions.createTitle') }}</template>
    <SubscriptionFormDialog
      ref="createFormRef"
      :initial-values="prefillValues ?? undefined"
      form-id="create-from-candidate-form"
      @submit="createSub"
      @cancel="handleCreateDialogClose(false)"
    />
    <template #footer>
      <div class="flex justify-end gap-2">
        <Button variant="outline" type="button" @click="handleCreateDialogClose(false)">
          {{ t('planned.subscriptions.cancel') }}
        </Button>
        <Button type="submit" form="create-from-candidate-form" :disabled="createFormRef?.isSubmitDisabled">
          {{ t('planned.subscriptions.form.create') }}
        </Button>
      </div>
    </template>
  </ResponsiveDialog>

  <!-- Sample transactions preview dialog -->
  <CandidateTransactionsDialog
    :open="isTransactionsDialogOpen"
    :transaction-ids="previewTransactionIds"
    @update:open="isTransactionsDialogOpen = $event"
  />
</template>
