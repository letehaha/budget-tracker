<script setup lang="ts">
import {
  getSubscriptionPayPreview,
  markSubscriptionPeriodPaid,
  type SubscriptionPayPreview,
} from '@/api/subscriptions';
import { VUE_QUERY_CACHE_KEYS, VUE_QUERY_GLOBAL_PREFIXES } from '@/common/const';
import { getAccountDisplayLabel } from '@/common/utils/account-display';
import ResponsiveDialog from '@/components/common/responsive-dialog.vue';
import DateField from '@/components/fields/date-field.vue';
import InputField from '@/components/fields/input-field.vue';
import UiButton from '@/components/lib/ui/button/Button.vue';
import { useNotificationCenter } from '@/components/notification-center';
import { ApiErrorResponseError } from '@/js/errors';
import { useAccountsStore } from '@/stores';
import { useMutation, useQueryClient } from '@tanstack/vue-query';
import { storeToRefs } from 'pinia';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

/**
 * Minimal subscription shape the pay flow needs. Accepts both list items and
 * detail models since both carry these fields.
 */
interface PayableSubscription {
  id: string;
  name: string;
  /** Decimal expected amount; null means the amount varies per payment. */
  expectedAmount: number | null;
  expectedCurrencyCode: string | null;
  /** Account the generated expense is booked against. */
  accountId: string | null;
}

const { t } = useI18n();
const queryClient = useQueryClient();
const { addSuccessNotification, addErrorNotification } = useNotificationCenter();
const { accountsRecord } = storeToRefs(useAccountsStore());

const emit = defineEmits<{
  paid: [];
}>();

function invalidateSubscriptionQueries() {
  queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.subscriptionDetails });
  queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.subscriptionsList });
  queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.subscriptionsSummary });
  queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.widgetSubscriptionsUpcoming });
  // Booking an expense creates a transaction, so refresh all transaction-aware queries.
  queryClient.invalidateQueries({ queryKey: [VUE_QUERY_GLOBAL_PREFIXES.transactionChange] });
}

const { mutate: markPaid, isPending } = useMutation({
  mutationFn: markSubscriptionPeriodPaid,
  onSuccess: () => {
    invalidateSubscriptionQueries();
    addSuccessNotification(t('planned.subscriptions.periods.notifications.markedAsPaid'));
    isDialogOpen.value = false;
    emit('paid');
  },
  onError(error) {
    const message =
      error instanceof ApiErrorResponseError
        ? error.data.message
        : t('planned.subscriptions.periods.notifications.markAsPaidFailed');
    addErrorNotification(message ?? t('planned.subscriptions.periods.notifications.markAsPaidFailed'));
  },
});

// --- Dialog state (only used when the amount must be confirmed) ---

const isDialogOpen = ref(false);
const activeSubscription = ref<PayableSubscription | null>(null);
const activePeriodId = ref<string | null>(null);
const amount = ref<string>('');
const paidDate = ref<Date>(new Date());
const isEstimateLoading = ref(false);
const estimate = ref<SubscriptionPayPreview | null>(null);
const today = new Date();

const accountLabel = computed(() => {
  const accountId = activeSubscription.value?.accountId;
  if (!accountId) return null;
  const account = accountsRecord.value[accountId];
  return account ? getAccountDisplayLabel(account) : null;
});

function accountCurrencyFor(subscription: PayableSubscription | null): string | null {
  if (!subscription?.accountId) return null;
  return accountsRecord.value[subscription.accountId]?.currencyCode ?? null;
}

function isCrossCurrency(subscription: PayableSubscription): boolean {
  const accountCurrency = accountCurrencyFor(subscription);
  return (
    subscription.expectedCurrencyCode != null &&
    accountCurrency != null &&
    subscription.expectedCurrencyCode !== accountCurrency
  );
}

/**
 * The dialog captures the amount booked, which is always in the account's
 * currency. Falls back to the subscription's own currency for account-less or
 * same-currency subscriptions.
 */
const dialogAmountCurrency = computed(() => {
  const sub = activeSubscription.value;
  if (!sub) return null;
  return accountCurrencyFor(sub) ?? sub.expectedCurrencyCode ?? null;
});

const isConfirmDisabled = computed(() => !amount.value || Number(amount.value) <= 0 || isPending.value);

/**
 * Entry point. Fixed same-currency amounts are booked in one click (no dialog);
 * variable amounts or cross-currency subscriptions open the dialog to capture /
 * confirm the booked amount.
 */
async function triggerPay({ subscription, periodId }: { subscription: PayableSubscription; periodId: string }) {
  // Without an account the backend cannot generate a transaction — fall back to
  // a plain mark-paid that only changes the period status.
  if (subscription.accountId == null) {
    markPaid({ id: subscription.id, periodId });
    return;
  }

  const crossCurrency = isCrossCurrency(subscription);

  // Fixed amount in the account's own currency: book in one click.
  if (subscription.expectedAmount != null && !crossCurrency) {
    markPaid({ id: subscription.id, periodId, createTransaction: true, time: new Date() });
    return;
  }

  // Variable amount or cross-currency: open the dialog. For cross-currency,
  // pre-fill with the app-converted estimate so the user can adjust if their
  // bank charged a different rate.
  activeSubscription.value = subscription;
  activePeriodId.value = periodId;
  amount.value = '';
  paidDate.value = new Date();
  estimate.value = null;
  isDialogOpen.value = true;

  if (crossCurrency) {
    await loadPreviewEstimate({ subscriptionId: subscription.id });
  }
}

async function loadPreviewEstimate({ subscriptionId }: { subscriptionId: string }) {
  isEstimateLoading.value = true;
  try {
    const preview = await getSubscriptionPayPreview({ id: subscriptionId });
    estimate.value = preview;
    // Pre-fill the account-currency estimate; the user can still edit it to the
    // exact amount their bank charged. Guard against clobbering anything typed
    // while the request was in flight.
    if (preview.convertedAmount != null && amount.value === '') {
      amount.value = String(preview.convertedAmount);
    }
  } catch {
    // The estimate is a convenience: if the rate lookup fails the dialog still
    // works and the user types the amount manually.
  } finally {
    isEstimateLoading.value = false;
  }
}

function confirmAmount() {
  if (isConfirmDisabled.value || !activeSubscription.value || !activePeriodId.value) return;
  markPaid({
    id: activeSubscription.value.id,
    periodId: activePeriodId.value,
    createTransaction: true,
    amount: Number(amount.value),
    time: paidDate.value,
  });
}

defineExpose({ triggerPay, isPending });
</script>

<template>
  <ResponsiveDialog v-model:open="isDialogOpen" dialog-content-class="max-w-md">
    <template #title>{{ $t('planned.subscriptions.periods.markPaid.title') }}</template>
    <template #description>
      {{ $t('planned.subscriptions.periods.markPaid.description', { name: activeSubscription?.name }) }}
    </template>

    <div class="grid gap-4">
      <InputField
        v-model="amount"
        type="number"
        step="0.01"
        min="0.01"
        only-positive
        :label="$t('planned.subscriptions.periods.markPaid.amountLabel')"
        :placeholder="$t('planned.subscriptions.periods.markPaid.amountPlaceholder')"
      >
        <template v-if="dialogAmountCurrency" #iconTrailing>
          <span>{{ dialogAmountCurrency }}</span>
        </template>
      </InputField>

      <p v-if="isEstimateLoading" class="text-muted-foreground text-xs">
        {{ $t('planned.subscriptions.periods.markPaid.estimateLoading') }}
      </p>
      <p v-else-if="estimate?.isCrossCurrency && estimate.expectedAmount != null" class="text-muted-foreground text-xs">
        {{
          $t('planned.subscriptions.periods.markPaid.crossCurrencyEstimate', {
            sourceAmount: estimate.expectedAmount,
            sourceCurrency: estimate.subscriptionCurrencyCode,
            accountCurrency: estimate.accountCurrencyCode,
          })
        }}
      </p>

      <DateField
        v-model="paidDate"
        :label="$t('planned.subscriptions.periods.markPaid.dateLabel')"
        :calendar-options="{ maxDate: today }"
      />

      <div v-if="accountLabel" class="bg-muted/40 rounded-md px-3 py-2 text-sm">
        <p class="text-muted-foreground text-xs">{{ $t('planned.subscriptions.periods.markPaid.accountLabel') }}</p>
        <p class="font-medium">{{ accountLabel }}</p>
      </div>
    </div>

    <template #footer>
      <div class="flex justify-end gap-2">
        <UiButton variant="outline" :disabled="isPending" @click="isDialogOpen = false">
          {{ $t('common.actions.cancel') }}
        </UiButton>
        <UiButton :disabled="isConfirmDisabled" :loading="isPending" @click="confirmAmount">
          {{ $t('planned.subscriptions.periods.markPaid.confirm') }}
        </UiButton>
      </div>
    </template>
  </ResponsiveDialog>
</template>
