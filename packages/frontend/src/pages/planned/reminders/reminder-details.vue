<script setup lang="ts">
import {
  deleteReminder,
  loadReminderById,
  loadReminderPeriods,
  revertPeriod,
  skipPeriod,
  unlinkPeriodTransaction,
  updateReminder,
} from '@/api/payment-reminders';
import { loadTransactionById } from '@/api/transactions';
import ResourceNotFound from '@/components/common/resource-not-found.vue';
import ResponsiveAlertDialog from '@/components/common/responsive-alert-dialog.vue';
import ResponsiveDialog from '@/components/common/responsive-dialog.vue';
import UiButton from '@/components/lib/ui/button/Button.vue';
import { DesktopOnlyTooltip } from '@/components/lib/ui/tooltip';
import TransactionDetailsModal from '@/components/transactions-list/transaction-details-modal.vue';
import { useManageTransactionDialog } from '@/components/transactions-list/use-manage-transaction-dialog';
import { CUSTOM_BREAKPOINTS, useWindowBreakpoints } from '@/composable/window-breakpoints';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import { useNotificationCenter } from '@/components/notification-center';
import { useFormatCurrency } from '@/composable/formatters';
import { ApiErrorResponseError, isNotFoundError } from '@/js/errors';
import { ROUTES_NAMES } from '@/routes';
import { PAYMENT_REMINDER_STATUSES, type PaymentReminderPeriodModel } from '@bt/shared/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { format, parseISO } from 'date-fns';
import { CheckIcon, LinkIcon, PencilIcon, SkipForwardIcon, Trash2Icon, UndoIcon, UnlinkIcon } from '@lucide/vue';
import { computed, defineAsyncComponent, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';

import MarkPaidDialog from './components/mark-paid-dialog.vue';
import ReminderFormDialog from './components/reminder-form-dialog.vue';
import {
  buildInstallmentNumbers,
  getFrequencyI18nKey,
  invalidateReminderQueries,
  isStatusActionable,
  isStatusRevertable,
} from './utils';

const ManageTransactionDialogContent = defineAsyncComponent(
  () => import('@/components/dialogs/manage-transaction/dialog-content.vue'),
);

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const queryClient = useQueryClient();
const { addSuccessNotification, addErrorNotification } = useNotificationCenter();
const { formatAmountByCurrencyCode } = useFormatCurrency();

const reminderId = computed(() => route.params.id as string);

const {
  data: reminder,
  isLoading,
  isError,
  error,
} = useQuery({
  queryFn: () => loadReminderById({ id: reminderId.value }),
  queryKey: [...VUE_QUERY_CACHE_KEYS.reminderDetails, reminderId],
  staleTime: Infinity,
  enabled: computed(() => !!reminderId.value),
  retry: false,
});

const isNotFound = computed(() => isError.value && isNotFoundError(error.value));

watch(
  isError,
  (errored) => {
    if (!errored || isNotFound.value) return;
    addErrorNotification(t('errors.api.unexpectedError'));
    router.replace({ name: ROUTES_NAMES.plannedReminders });
  },
  { immediate: true },
);

const periodsLimit = ref(6);
const { data: periodsData } = useQuery({
  queryFn: () =>
    loadReminderPeriods({
      reminderId: reminderId.value,
      limit: periodsLimit.value,
    }),
  queryKey: [...VUE_QUERY_CACHE_KEYS.reminderPeriods, reminderId, periodsLimit],
  staleTime: Infinity,
  enabled: computed(() => !!reminderId.value),
});

const periods = computed(() => periodsData.value?.periods ?? []);
const totalPeriods = computed(() => periodsData.value?.total ?? 0);
const hasMore = computed(() => periods.value.length < totalPeriods.value);

function loadMore() {
  periodsLimit.value += 6;
}

const invalidateAll = () => invalidateReminderQueries({ queryClient });

// Edit
const isEditOpen = ref(false);
const editFormRef = ref<InstanceType<typeof ReminderFormDialog>>();

const { mutate: updateMutation, isPending: isUpdating } = useMutation({
  mutationFn: updateReminder,
  onSuccess: () => {
    invalidateAll();
    isEditOpen.value = false;
    addSuccessNotification(t('planned.reminders.notifications.reminderUpdated'));
  },
  onError(err) {
    const message =
      err instanceof ApiErrorResponseError ? err.data.message : t('planned.reminders.notifications.updateFailed');
    editFormRef.value?.setError({ error: message ?? '' });
  },
});

// Delete
const isDeleteOpen = ref(false);
const { mutate: deleteMutation } = useMutation({
  mutationFn: deleteReminder,
  onSuccess: () => {
    addSuccessNotification(t('planned.reminders.notifications.reminderDeleted'));
    router.push({ name: ROUTES_NAMES.plannedReminders });
  },
  onError(err) {
    const message =
      err instanceof ApiErrorResponseError ? err.data.message : t('planned.reminders.notifications.deleteFailed');
    addErrorNotification(message ?? t('planned.reminders.notifications.deleteFailed'));
  },
});

// Period actions
const markPaidRef = ref<InstanceType<typeof MarkPaidDialog>>();
const isMarkingPaid = computed(() => markPaidRef.value?.isPending ?? false);

function payPeriod({ periodId }: { periodId: string }) {
  if (!reminder.value) return;
  markPaidRef.value?.triggerPay({ reminder: reminder.value, periodId });
}

const { mutate: skipMutation, isPending: isSkipping } = useMutation({
  mutationFn: skipPeriod,
  onSuccess: () => {
    invalidateAll();
    addSuccessNotification(t('planned.reminders.notifications.periodSkipped'));
  },
  onError(err) {
    const message =
      err instanceof ApiErrorResponseError ? err.data.message : t('planned.reminders.notifications.skipFailed');
    addErrorNotification(message ?? t('planned.reminders.notifications.skipFailed'));
  },
});

const { mutate: unlinkMutation, isPending: isUnlinking } = useMutation({
  mutationFn: unlinkPeriodTransaction,
  onSuccess: () => {
    invalidateAll();
    addSuccessNotification(t('planned.reminders.notifications.transactionUnlinked'));
  },
  onError(err) {
    const message =
      err instanceof ApiErrorResponseError ? err.data.message : t('planned.reminders.notifications.unlinkFailed');
    addErrorNotification(message ?? t('planned.reminders.notifications.unlinkFailed'));
  },
});

const revertTarget = ref<PaymentReminderPeriodModel | null>(null);
const { mutate: revertMutation, isPending: isReverting } = useMutation({
  mutationFn: revertPeriod,
  onSuccess: () => {
    invalidateAll();
    revertTarget.value = null;
    addSuccessNotification(t('planned.reminders.notifications.periodReverted'));
  },
  onError(err) {
    const message =
      err instanceof ApiErrorResponseError ? err.data.message : t('planned.reminders.notifications.revertFailed');
    addErrorNotification(message ?? t('planned.reminders.notifications.revertFailed'));
  },
});

// Reverting a period behaves differently depending on its transaction link, so
// the confirmation must describe the actual consequence: a transaction the app
// generated on "mark paid" is deleted (and the balance restored), a transaction
// the user linked themselves is only detached, and a period with no transaction
// just returns to unpaid.
const revertDescriptionKey = computed(() => {
  const period = revertTarget.value;
  if (period?.transactionId && period.transactionAutoCreated) {
    return 'planned.reminders.dialogs.revertDescriptionDeletesTransaction';
  }
  if (period?.transactionId) {
    return 'planned.reminders.dialogs.revertDescriptionUnlinksTransaction';
  }
  return 'planned.reminders.dialogs.revertDescription';
});

const isPeriodActionPending = computed(
  () => isMarkingPaid.value || isSkipping.value || isUnlinking.value || isReverting.value,
);

function getStatusBadge(status: string): { label: string; class: string } {
  switch (status) {
    case PAYMENT_REMINDER_STATUSES.paid:
      return { label: t('planned.reminders.details.period.paid'), class: 'bg-success-text/20 text-success-text' };
    case PAYMENT_REMINDER_STATUSES.overdue:
      return {
        label: t('planned.reminders.details.period.overdue'),
        class: 'bg-destructive/10 text-destructive-text',
      };
    case PAYMENT_REMINDER_STATUSES.skipped:
      return { label: t('planned.reminders.details.period.skipped'), class: 'bg-muted text-muted-foreground' };
    case PAYMENT_REMINDER_STATUSES.upcoming:
      return {
        label: t('planned.reminders.details.period.upcoming'),
        class: 'border border-border text-foreground',
      };
    default:
      return { label: status, class: 'border border-border text-foreground' };
  }
}

function groupPeriodsByMonth(periodsList: PaymentReminderPeriodModel[]) {
  const groups: Record<string, PaymentReminderPeriodModel[]> = {};
  for (const p of periodsList) {
    const key = p.dueDate.substring(0, 7); // "YYYY-MM"
    if (!groups[key]) groups[key] = [];
    groups[key]!.push(p);
  }
  return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a));
}

const periodGroups = computed(() => groupPeriodsByMonth(periods.value));

// "Payment X of N" labels, shown only for installment reminders (those with a cap).
const installmentNumbers = computed(() =>
  buildInstallmentNumbers({ periodsDesc: periods.value, total: totalPeriods.value }),
);
const maxOccurrences = computed(() => reminder.value?.maxOccurrences ?? null);

// Open the transaction a period is linked to, reusing the canonical manage-transaction
// dialog (same component the records list uses).
const isMobileView = useWindowBreakpoints(CUSTOM_BREAKPOINTS.uiMobile);
const { isDialogVisible, dialogProps, isCompactDialog, handleRecordClick, closeDialog } = useManageTransactionDialog();
const isOpeningTransaction = ref(false);

async function openTransaction({ transactionId }: { transactionId: string }) {
  if (isOpeningTransaction.value) return;
  isOpeningTransaction.value = true;
  try {
    const tx = await loadTransactionById({ id: transactionId });
    if (tx) {
      handleRecordClick([tx, undefined]);
    } else {
      addErrorNotification(t('planned.reminders.notifications.transactionLoadFailed'));
    }
  } catch {
    addErrorNotification(t('planned.reminders.notifications.transactionLoadFailed'));
  } finally {
    isOpeningTransaction.value = false;
  }
}
</script>

<template>
  <ResourceNotFound
    v-if="isNotFound"
    :title="t('planned.reminders.notFound')"
    :description="t('planned.reminders.notFoundDescription')"
    :link-label="t('planned.reminders.backToList')"
    :link-to="{ name: ROUTES_NAMES.plannedReminders }"
  />

  <!-- Loading skeleton -->
  <div v-else-if="isLoading" class="animate-pulse">
    <div class="bg-muted mb-4 h-8 w-1/3 rounded" />
    <div class="bg-muted mb-2 h-5 w-2/3 rounded" />
    <div class="bg-muted mb-6 h-32 rounded-lg" />
    <div class="bg-muted mb-2 h-4 w-1/4 rounded" />
    <div class="grid gap-2">
      <div v-for="i in 3" :key="i" class="bg-muted h-16 rounded-lg" />
    </div>
  </div>

  <div v-else-if="reminder">
    <!-- Header -->
    <div class="mb-6 flex items-center justify-between gap-2">
      <div>
        <h1 class="line-clamp-2 text-2xl font-bold break-all">{{ reminder.name }}</h1>
        <p class="text-muted-foreground text-sm">
          {{ $t(getFrequencyI18nKey({ freq: reminder.frequency })) }}
          <template v-if="reminder.subscription">
            &middot; {{ $t('planned.reminders.details.linkedTo', { name: reminder.subscription.name }) }}
          </template>
        </p>
      </div>
      <div class="flex gap-2">
        <UiButton variant="outline" size="sm" @click="isEditOpen = true">
          <PencilIcon class="mr-1 size-4" />
          {{ $t('planned.reminders.edit') }}
        </UiButton>
        <UiButton variant="outline" size="sm" @click="isDeleteOpen = true">
          <Trash2Icon class="text-destructive-text mr-1 size-4" />
          {{ $t('planned.reminders.delete') }}
        </UiButton>
      </div>
    </div>

    <!-- Info card -->
    <div class="bg-card mb-6 rounded-lg border p-4">
      <div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div>
          <p class="text-muted-foreground text-xs">{{ $t('planned.reminders.details.infoCard.dueDate') }}</p>
          <p class="font-medium">{{ reminder.dueDate }}</p>
        </div>
        <div v-if="reminder.expectedAmount != null">
          <p class="text-muted-foreground text-xs">{{ $t('planned.reminders.details.infoCard.amount') }}</p>
          <p class="font-medium">{{ formatAmountByCurrencyCode(reminder.expectedAmount!, reminder.currencyCode!) }}</p>
        </div>
        <div v-if="reminder.remindBefore?.length">
          <p class="text-muted-foreground text-xs">{{ $t('planned.reminders.details.infoCard.remindBefore') }}</p>
          <p class="font-medium">{{ reminder.remindBefore.join(', ').replaceAll('_', ' ') }}</p>
        </div>
      </div>
    </div>

    <!-- Period History -->
    <div>
      <h2 class="text-muted-foreground mb-3 text-sm font-medium tracking-wide uppercase">
        {{ $t('planned.reminders.details.paymentHistory') }}
      </h2>

      <div v-if="!periods.length" class="text-muted-foreground py-8 text-center text-sm">
        {{ $t('planned.reminders.details.noPaymentPeriods') }}
      </div>

      <div v-for="[monthKey, monthPeriods] in periodGroups" :key="monthKey" class="mb-4">
        <h3 class="text-muted-foreground mb-2 text-xs font-medium">
          {{ format(parseISO(monthKey + '-01'), 'MMMM yyyy') }}
        </h3>
        <div class="grid gap-2">
          <div
            v-for="period in monthPeriods"
            :key="period.id"
            class="bg-card flex items-center justify-between rounded-lg border p-3"
          >
            <div class="flex items-center gap-3">
              <span
                :class="[
                  'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium',
                  getStatusBadge(period.status).class,
                ]"
              >
                {{ getStatusBadge(period.status).label }}
              </span>
              <div>
                <p class="text-sm font-medium">
                  {{ $t('planned.reminders.details.period.due', { date: period.dueDate }) }}
                </p>
                <p v-if="maxOccurrences && installmentNumbers[period.id]" class="text-muted-foreground text-xs">
                  {{
                    $t('planned.reminders.details.period.installment', {
                      current: installmentNumbers[period.id],
                      total: maxOccurrences,
                    })
                  }}
                </p>
                <p v-if="period.paidAt" class="text-muted-foreground text-xs">
                  {{ $t('planned.reminders.details.period.paidAt', { date: format(period.paidAt, 'PP') }) }}
                </p>
                <UiButton
                  v-if="period.transactionId"
                  type="button"
                  variant="link"
                  size="sm"
                  class="h-auto p-0 text-xs"
                  :disabled="isOpeningTransaction"
                  @click="openTransaction({ transactionId: period.transactionId })"
                >
                  <LinkIcon class="size-3" />
                  {{ $t('planned.reminders.details.period.viewTransaction') }}
                </UiButton>
                <p v-if="period.notes" class="text-muted-foreground text-xs italic">
                  {{ period.notes }}
                </p>
              </div>
            </div>

            <div class="flex items-center gap-1">
              <DesktopOnlyTooltip
                v-if="isStatusActionable({ status: period.status })"
                :content="$t('planned.reminders.details.period.tooltips.markAsPaid')"
              >
                <UiButton
                  variant="soft-success"
                  size="sm"
                  :title="$t('planned.reminders.details.period.tooltips.markAsPaid')"
                  :disabled="isPeriodActionPending"
                  @click="payPeriod({ periodId: period.id })"
                >
                  <CheckIcon class="size-4" />
                </UiButton>
              </DesktopOnlyTooltip>
              <DesktopOnlyTooltip
                v-if="isStatusActionable({ status: period.status })"
                :content="$t('planned.reminders.details.period.tooltips.skip')"
              >
                <UiButton
                  variant="ghost"
                  size="sm"
                  :title="$t('planned.reminders.details.period.tooltips.skip')"
                  :disabled="isPeriodActionPending"
                  @click="skipMutation({ reminderId: reminder.id, periodId: period.id })"
                >
                  <SkipForwardIcon class="size-4" />
                </UiButton>
              </DesktopOnlyTooltip>
              <DesktopOnlyTooltip
                v-if="period.transactionId"
                :content="$t('planned.reminders.details.period.tooltips.unlinkTransaction')"
              >
                <UiButton
                  variant="ghost"
                  size="sm"
                  :title="$t('planned.reminders.details.period.tooltips.unlinkTransaction')"
                  :disabled="isPeriodActionPending"
                  @click="unlinkMutation({ reminderId: reminder.id, periodId: period.id })"
                >
                  <UnlinkIcon class="size-4" />
                </UiButton>
              </DesktopOnlyTooltip>
              <DesktopOnlyTooltip
                v-if="isStatusRevertable({ status: period.status })"
                :content="$t('planned.reminders.details.period.tooltips.revert')"
              >
                <UiButton
                  variant="ghost"
                  size="sm"
                  :title="$t('planned.reminders.details.period.tooltips.revert')"
                  :disabled="isPeriodActionPending"
                  @click="revertTarget = period"
                >
                  <UndoIcon class="size-4" />
                </UiButton>
              </DesktopOnlyTooltip>
            </div>
          </div>
        </div>
      </div>

      <UiButton v-if="hasMore" variant="outline" class="mt-4 w-full" @click="loadMore">
        {{ $t('planned.reminders.details.loadMore') }}
      </UiButton>
    </div>

    <!-- Edit dialog -->
    <ResponsiveDialog v-model:open="isEditOpen" dialog-content-class="max-w-lg">
      <template #title>{{ $t('planned.reminders.dialogs.editTitle') }}</template>
      <ReminderFormDialog
        ref="editFormRef"
        :initial-values="reminder"
        :is-subscription-linked="!!reminder.subscriptionId"
        form-id="edit-reminder-form"
        @submit="(payload) => reminder && updateMutation({ id: reminder.id, payload })"
        @cancel="isEditOpen = false"
      />
      <template #footer>
        <div class="flex justify-end gap-2">
          <UiButton variant="outline" @click="isEditOpen = false">{{ $t('common.actions.cancel') }}</UiButton>
          <UiButton
            type="submit"
            form="edit-reminder-form"
            :disabled="editFormRef?.isSubmitDisabled || isUpdating"
            :loading="isUpdating"
          >
            {{ $t('common.actions.save') }}
          </UiButton>
        </div>
      </template>
    </ResponsiveDialog>

    <!-- Delete confirmation -->
    <ResponsiveAlertDialog
      :open="isDeleteOpen"
      :confirm-label="$t('planned.reminders.delete')"
      confirm-variant="destructive"
      @update:open="isDeleteOpen = $event"
      @confirm="deleteMutation({ id: reminder.id })"
      @cancel="isDeleteOpen = false"
    >
      <template #title>{{ $t('planned.reminders.dialogs.deleteTitle') }}</template>
      <template #description>
        {{ $t('planned.reminders.dialogs.deleteDescription', { name: reminder.name }) }}
      </template>
    </ResponsiveAlertDialog>

    <!-- Revert confirmation -->
    <ResponsiveAlertDialog
      :open="!!revertTarget"
      :confirm-label="$t('planned.reminders.dialogs.revertConfirm')"
      confirm-variant="default"
      @update:open="
        (val: boolean) => {
          if (!val) revertTarget = null;
        }
      "
      @confirm="revertTarget && revertMutation({ reminderId: reminder.id, periodId: revertTarget.id })"
      @cancel="revertTarget = null"
    >
      <template #title>{{ $t('planned.reminders.dialogs.revertTitle') }}</template>
      <template #description>
        {{ $t(revertDescriptionKey, { date: revertTarget?.dueDate }) }}
      </template>
    </ResponsiveAlertDialog>

    <!-- Mark-paid flow (decides instant vs. amount dialog internally) -->
    <MarkPaidDialog ref="markPaidRef" />

    <!-- Linked-transaction detail dialog -->
    <TransactionDetailsModal v-model:open="isDialogVisible" :mobile="isMobileView" :is-compact="isCompactDialog">
      <ManageTransactionDialogContent v-bind="dialogProps" @close-modal="closeDialog" />
    </TransactionDetailsModal>
  </div>
</template>
