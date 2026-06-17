<script setup lang="ts">
import { markPeriodPaid } from '@/api/payment-reminders';
import ResponsiveDialog from '@/components/common/responsive-dialog.vue';
import DateField from '@/components/fields/date-field.vue';
import InputField from '@/components/fields/input-field.vue';
import UiButton from '@/components/lib/ui/button/Button.vue';
import { getAccountDisplayLabel } from '@/common/utils/account-display';
import { useNotificationCenter } from '@/components/notification-center';
import { ApiErrorResponseError } from '@/js/errors';
import { useAccountsStore } from '@/stores';
import { useMutation, useQueryClient } from '@tanstack/vue-query';
import { storeToRefs } from 'pinia';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

import { invalidateReminderQueries } from '../utils';

/**
 * Minimal reminder shape the pay flow needs. Accepts both the list item and the
 * detail model since both carry these fields.
 */
interface PayableReminder {
  id: string;
  name: string;
  /** Decimal expected amount; null means the amount varies per payment. */
  expectedAmount: number | null;
  currencyCode: string | null;
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

const { mutate: markPaid, isPending } = useMutation({
  mutationFn: markPeriodPaid,
  onSuccess: () => {
    invalidateReminderQueries({ queryClient });
    addSuccessNotification(t('planned.reminders.notifications.markedAsPaid'));
    isDialogOpen.value = false;
    emit('paid');
  },
  onError(error) {
    const message =
      error instanceof ApiErrorResponseError
        ? error.data.message
        : t('planned.reminders.notifications.markAsPaidFailed');
    addErrorNotification(message ?? t('planned.reminders.notifications.markAsPaidFailed'));
  },
});

// --- Dialog state (only used for variable-amount reminders) ---

const isDialogOpen = ref(false);
const activeReminder = ref<PayableReminder | null>(null);
const activePeriodId = ref<string | null>(null);
const amount = ref<string>('');
const paidDate = ref<Date>(new Date());

const today = computed(() => new Date());

const accountLabel = computed(() => {
  const accountId = activeReminder.value?.accountId;
  if (!accountId) return null;
  const account = accountsRecord.value[accountId];
  return account ? getAccountDisplayLabel(account) : null;
});

const isConfirmDisabled = computed(() => !amount.value || Number(amount.value) <= 0 || isPending.value);

/**
 * Entry point for both pages. Fixed-amount reminders are paid instantly (no
 * dialog) so a single click books the expense; variable-amount reminders open a
 * small dialog to capture the actual amount and date first.
 */
function triggerPay({ reminder, periodId }: { reminder: PayableReminder; periodId: string }) {
  // Reminders without an account cannot generate a transaction (backend rejects
  // createTransaction:true when accountId is null). Fall back to a plain mark-paid
  // that records no transaction — same behaviour as before transaction generation
  // was added.
  if (reminder.accountId == null) {
    markPaid({ reminderId: reminder.id, periodId });
    return;
  }

  if (reminder.expectedAmount != null) {
    markPaid({ reminderId: reminder.id, periodId, createTransaction: true, time: new Date() });
    return;
  }

  activeReminder.value = reminder;
  activePeriodId.value = periodId;
  amount.value = '';
  paidDate.value = new Date();
  isDialogOpen.value = true;
}

function confirmVariableAmount() {
  if (isConfirmDisabled.value || !activeReminder.value || !activePeriodId.value) return;
  markPaid({
    reminderId: activeReminder.value.id,
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
    <template #title>{{ $t('planned.reminders.markPaid.title') }}</template>
    <template #description>
      {{ $t('planned.reminders.markPaid.description', { name: activeReminder?.name }) }}
    </template>

    <div class="grid gap-4">
      <InputField
        v-model="amount"
        type="number"
        step="0.01"
        min="0.01"
        only-positive
        :label="$t('planned.reminders.markPaid.amountLabel')"
        :placeholder="$t('planned.reminders.markPaid.amountPlaceholder')"
      >
        <template v-if="activeReminder?.currencyCode" #iconTrailing>
          <span>{{ activeReminder.currencyCode }}</span>
        </template>
      </InputField>

      <DateField
        v-model="paidDate"
        :label="$t('planned.reminders.markPaid.dateLabel')"
        :calendar-options="{ maxDate: today }"
      />

      <div v-if="accountLabel" class="bg-muted/40 rounded-md px-3 py-2 text-sm">
        <p class="text-muted-foreground text-xs">{{ $t('planned.reminders.markPaid.accountLabel') }}</p>
        <p class="font-medium">{{ accountLabel }}</p>
      </div>
    </div>

    <template #footer>
      <div class="flex justify-end gap-2">
        <UiButton variant="outline" :disabled="isPending" @click="isDialogOpen = false">
          {{ $t('common.actions.cancel') }}
        </UiButton>
        <UiButton :disabled="isConfirmDisabled" :loading="isPending" @click="confirmVariableAmount">
          {{ $t('planned.reminders.markPaid.confirm') }}
        </UiButton>
      </div>
    </template>
  </ResponsiveDialog>
</template>
