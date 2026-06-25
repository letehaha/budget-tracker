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
import SelectField from '@/components/fields/select-field.vue';
import UiButton from '@/components/lib/ui/button/Button.vue';
import { Label } from '@/components/lib/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/lib/ui/radio-group';
import { useNotificationCenter } from '@/components/notification-center';
import { ApiErrorResponseError } from '@/js/errors';
import { cn } from '@/lib/utils';
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
  /** Account the generated expense is booked against. null = no account yet. */
  accountId: string | null;
}

/** How an account-less payment is recorded: status-only vs. a booked expense. */
type RecordMode = 'mark' | 'transaction';

const { t } = useI18n();
const queryClient = useQueryClient();
const { addSuccessNotification, addErrorNotification } = useNotificationCenter();
const accountsStore = useAccountsStore();
const { accountsRecord } = storeToRefs(accountsStore);

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
    addSuccessNotification(t('dialogs.subscriptionMarkPaid.notifications.markedAsPaid'));
    isDialogOpen.value = false;
    emit('paid');
  },
  onError(error) {
    const message =
      error instanceof ApiErrorResponseError
        ? error.data.message
        : t('dialogs.subscriptionMarkPaid.notifications.markAsPaidFailed');
    addErrorNotification(message ?? t('dialogs.subscriptionMarkPaid.notifications.markAsPaidFailed'));
  },
});

// --- Dialog state ---

const isDialogOpen = ref(false);
const activeSubscription = ref<PayableSubscription | null>(null);
const activePeriodId = ref<string | null>(null);
const amount = ref<string>('');
const paidDate = ref<Date>(new Date());
const isEstimateLoading = ref(false);
const estimate = ref<SubscriptionPayPreview | null>(null);
const today = new Date();

// Account-less flow only: the user's choice + the account they pick to book against.
const recordMode = ref<RecordMode>('mark');
const selectedAccountId = ref<string | null>(null);

/** A subscription that already has an account skips the choice UI entirely. */
const hasAccount = computed(() => activeSubscription.value?.accountId != null);

/** Whether the account/amount/date fields are shown (booking a real transaction). */
const isBooking = computed(() => hasAccount.value || recordMode.value === 'transaction');

const accountOptions = computed(() =>
  accountsStore.activeAccounts.map((account) => ({
    label: `${account.name} (${account.currencyCode})`,
    value: account.id,
  })),
);

const selectedAccount = computed(() => accountOptions.value.find((a) => a.value === selectedAccountId.value) ?? null);

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
 * The booked amount is always denominated in the account's currency. For an
 * account-less subscription that follows the account the user is selecting; it
 * falls back to the subscription's own currency before one is chosen.
 */
const dialogAmountCurrency = computed(() => {
  const sub = activeSubscription.value;
  if (!sub) return null;
  if (sub.accountId == null) {
    if (selectedAccountId.value) return accountsRecord.value[selectedAccountId.value]?.currencyCode ?? null;
    return sub.expectedCurrencyCode ?? null;
  }
  return accountCurrencyFor(sub) ?? sub.expectedCurrencyCode ?? null;
});

const isConfirmDisabled = computed(() => {
  if (isPending.value) return true;
  // Plain "just mark as paid" needs no input.
  if (!isBooking.value) return false;
  // Booking against a not-yet-linked account requires picking one.
  if (!hasAccount.value && !selectedAccountId.value) return true;
  return !amount.value || Number(amount.value) <= 0;
});

const confirmLabel = computed(() =>
  isBooking.value ? t('dialogs.subscriptionMarkPaid.confirm') : t('dialogs.subscriptionMarkPaid.confirmMarkOnly'),
);

/**
 * Entry point.
 *  - No account: open the dialog so the user chooses between a plain mark-paid
 *    and booking a real transaction (which needs an account).
 *  - Fixed same-currency amount: book in one click, no dialog.
 *  - Variable / cross-currency amount: open the dialog to capture the amount.
 */
async function triggerPay({ subscription, periodId }: { subscription: PayableSubscription; periodId: string }) {
  if (subscription.accountId == null) {
    activeSubscription.value = subscription;
    activePeriodId.value = periodId;
    recordMode.value = 'mark';
    selectedAccountId.value = null;
    // Seed with the plan's expected amount as a convenience; the user confirms or
    // edits it, and it is booked in the chosen account's currency.
    amount.value = subscription.expectedAmount != null ? String(subscription.expectedAmount) : '';
    paidDate.value = new Date();
    estimate.value = null;
    isDialogOpen.value = true;
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

function confirmPay() {
  if (isConfirmDisabled.value || !activeSubscription.value || !activePeriodId.value) return;

  const id = activeSubscription.value.id;
  const periodId = activePeriodId.value;

  // Account-less, user chose to only update the schedule.
  if (!isBooking.value) {
    markPaid({ id, periodId });
    return;
  }

  markPaid({
    id,
    periodId,
    createTransaction: true,
    amount: Number(amount.value),
    time: paidDate.value,
    // Pass the picked account only in the account-less flow; the backend links
    // it to the subscription so future payments reuse it.
    ...(!hasAccount.value && selectedAccountId.value ? { accountId: selectedAccountId.value } : {}),
  });
}

defineExpose({ triggerPay, isPending });
</script>

<template>
  <ResponsiveDialog v-model:open="isDialogOpen" dialog-content-class="max-w-md">
    <template #title>{{ $t('dialogs.subscriptionMarkPaid.title') }}</template>
    <template #description>
      <template v-if="!hasAccount">
        {{ $t('dialogs.subscriptionMarkPaid.chooseDescription', { name: activeSubscription?.name }) }}
      </template>
      <template v-else>
        {{ $t('dialogs.subscriptionMarkPaid.description', { name: activeSubscription?.name }) }}
      </template>
    </template>

    <div class="grid gap-4">
      <!-- Account-less: choose how to record the payment. -->
      <RadioGroup v-if="!hasAccount" v-model="recordMode" class="grid gap-3">
        <Label
          :class="
            cn(
              'border-input hover:bg-accent hover:text-accent-foreground flex cursor-pointer flex-col gap-1 rounded-md border p-3 transition-colors',
              recordMode === 'mark' && 'border-primary bg-primary/5',
            )
          "
        >
          <div class="flex items-center gap-2">
            <RadioGroupItem value="mark" />
            <span class="font-medium">{{ $t('dialogs.subscriptionMarkPaid.recordModeMarkTitle') }}</span>
          </div>
          <span class="text-muted-foreground pl-6 text-xs">
            {{ $t('dialogs.subscriptionMarkPaid.recordModeMarkDescription') }}
          </span>
        </Label>
        <Label
          :class="
            cn(
              'border-input hover:bg-accent hover:text-accent-foreground flex cursor-pointer flex-col gap-1 rounded-md border p-3 transition-colors',
              recordMode === 'transaction' && 'border-primary bg-primary/5',
            )
          "
        >
          <div class="flex items-center gap-2">
            <RadioGroupItem value="transaction" />
            <span class="font-medium">
              {{ $t('dialogs.subscriptionMarkPaid.recordModeTransactionTitle') }}
            </span>
          </div>
          <span class="text-muted-foreground pl-6 text-xs">
            {{ $t('dialogs.subscriptionMarkPaid.recordModeTransactionDescription') }}
          </span>
        </Label>
      </RadioGroup>

      <!-- Booking a real transaction: capture account (when not yet linked), amount, date. -->
      <template v-if="isBooking">
        <SelectField
          v-if="!hasAccount"
          :model-value="selectedAccount"
          :values="accountOptions"
          label-key="label"
          value-key="value"
          with-search
          :label="$t('dialogs.subscriptionMarkPaid.accountLabel')"
          :placeholder="$t('dialogs.subscriptionMarkPaid.accountPlaceholder')"
          @update:model-value="(v: any) => (selectedAccountId = v?.value ?? null)"
        />

        <InputField
          v-model="amount"
          type="number"
          step="0.01"
          min="0.01"
          only-positive
          :label="$t('dialogs.subscriptionMarkPaid.amountLabel')"
          :placeholder="$t('dialogs.subscriptionMarkPaid.amountPlaceholder')"
        >
          <template v-if="dialogAmountCurrency" #iconTrailing>
            <span>{{ dialogAmountCurrency }}</span>
          </template>
        </InputField>

        <p v-if="isEstimateLoading" class="text-muted-foreground text-xs">
          {{ $t('dialogs.subscriptionMarkPaid.estimateLoading') }}
        </p>
        <p
          v-else-if="estimate?.isCrossCurrency && estimate.expectedAmount != null"
          class="text-muted-foreground text-xs"
        >
          {{
            $t('dialogs.subscriptionMarkPaid.crossCurrencyEstimate', {
              sourceAmount: estimate.expectedAmount,
              sourceCurrency: estimate.subscriptionCurrencyCode,
              accountCurrency: estimate.accountCurrencyCode,
            })
          }}
        </p>

        <DateField
          v-model="paidDate"
          :label="$t('dialogs.subscriptionMarkPaid.dateLabel')"
          :calendar-options="{ maxDate: today }"
        />

        <div v-if="accountLabel" class="bg-muted/40 rounded-md px-3 py-2 text-sm">
          <p class="text-muted-foreground text-xs">{{ $t('dialogs.subscriptionMarkPaid.accountLabel') }}</p>
          <p class="font-medium">{{ accountLabel }}</p>
        </div>
      </template>
    </div>

    <template #footer>
      <div class="flex justify-end gap-2">
        <UiButton variant="outline" :disabled="isPending" @click="isDialogOpen = false">
          {{ $t('common.actions.cancel') }}
        </UiButton>
        <UiButton :disabled="isConfirmDisabled" :loading="isPending" @click="confirmPay">
          {{ confirmLabel }}
        </UiButton>
      </div>
    </template>
  </ResponsiveDialog>
</template>
