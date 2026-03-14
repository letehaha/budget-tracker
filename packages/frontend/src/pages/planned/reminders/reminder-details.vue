<script setup lang="ts">
import {
  deleteReminder,
  loadReminderById,
  loadReminderPeriods,
  markPeriodPaid,
  revertPeriod,
  skipPeriod,
  unlinkPeriodTransaction,
  updateReminder,
  type PaymentReminderDetail,
} from '@/api/payment-reminders';
import ResponsiveAlertDialog from '@/components/common/responsive-alert-dialog.vue';
import ResponsiveDialog from '@/components/common/responsive-dialog.vue';
import UiButton from '@/components/lib/ui/button/Button.vue';
import { DesktopOnlyTooltip } from '@/components/lib/ui/tooltip';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import { useNotificationCenter } from '@/components/notification-center';
import { useFormatCurrency } from '@/composable/formatters';
import { ApiErrorResponseError } from '@/js/errors';
import { ROUTES_NAMES } from '@/routes';
import { PAYMENT_REMINDER_STATUSES, type PaymentReminderPeriodModel } from '@bt/shared/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { format, parseISO } from 'date-fns';
import { CheckIcon, LinkIcon, PencilIcon, SkipForwardIcon, Trash2Icon, UndoIcon, UnlinkIcon } from 'lucide-vue-next';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';

import ReminderFormDialog from './components/reminder-form-dialog.vue';
import { getFrequencyI18nKey, invalidateReminderQueries, isStatusActionable, isStatusRevertable } from './utils';

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
} = useQuery({
  queryFn: () => loadReminderById({ id: reminderId.value }),
  queryKey: [...VUE_QUERY_CACHE_KEYS.reminderDetails, reminderId],
  staleTime: Infinity,
  enabled: computed(() => !!reminderId.value),
  retry: false,
});

watch(isError, (errored) => {
  if (errored) {
    addErrorNotification(t('planned.reminders.notifications.notFound'));
    router.replace({ name: ROUTES_NAMES.plannedReminders });
  }
});

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
    addSuccessNotification(t('planned.reminders.notifications.updated'));
  },
  onError(error) {
    const message =
      error instanceof ApiErrorResponseError ? error.data.message : t('planned.reminders.notifications.updateFailed');
    editFormRef.value?.setError({ error: message ?? '' });
  },
});

// Delete
const isDeleteOpen = ref(false);
const { mutate: deleteMutation } = useMutation({
  mutationFn: deleteReminder,
  onSuccess: () => {
    addSuccessNotification(t('planned.reminders.notifications.deleted'));
    router.push({ name: ROUTES_NAMES.plannedReminders });
  },
  onError(error) {
    const message =
      error instanceof ApiErrorResponseError ? error.data.message : t('planned.reminders.notifications.deleteFailed');
    addErrorNotification(message ?? t('planned.reminders.notifications.deleteFailed'));
  },
});

// Period actions
const { mutate: markPaidMutation, isPending: isMarkingPaid } = useMutation({
  mutationFn: markPeriodPaid,
  onSuccess: () => {
    invalidateAll();
    addSuccessNotification(t('planned.reminders.notifications.markedPaid'));
  },
  onError(error) {
    const message =
      error instanceof ApiErrorResponseError ? error.data.message : t('planned.reminders.notifications.markPaidFailed');
    addErrorNotification(message ?? t('planned.reminders.notifications.markPaidFailed'));
  },
});

const { mutate: skipMutation, isPending: isSkipping } = useMutation({
  mutationFn: skipPeriod,
  onSuccess: () => {
    invalidateAll();
    addSuccessNotification(t('planned.reminders.notifications.skipped'));
  },
  onError(error) {
    const message =
      error instanceof ApiErrorResponseError ? error.data.message : t('planned.reminders.notifications.skipFailed');
    addErrorNotification(message ?? t('planned.reminders.notifications.skipFailed'));
  },
});

const { mutate: unlinkMutation, isPending: isUnlinking } = useMutation({
  mutationFn: unlinkPeriodTransaction,
  onSuccess: () => {
    invalidateAll();
    addSuccessNotification(t('planned.reminders.notifications.unlinked'));
  },
  onError(error) {
    const message =
      error instanceof ApiErrorResponseError ? error.data.message : t('planned.reminders.notifications.unlinkFailed');
    addErrorNotification(message ?? t('planned.reminders.notifications.unlinkFailed'));
  },
});

const revertTarget = ref<PaymentReminderPeriodModel | null>(null);
const { mutate: revertMutation, isPending: isReverting } = useMutation({
  mutationFn: revertPeriod,
  onSuccess: () => {
    invalidateAll();
    revertTarget.value = null;
    addSuccessNotification(t('planned.reminders.notifications.reverted'));
  },
  onError(error) {
    const message =
      error instanceof ApiErrorResponseError ? error.data.message : t('planned.reminders.notifications.revertFailed');
    addErrorNotification(message ?? t('planned.reminders.notifications.revertFailed'));
  },
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
</script>

<template>
  <!-- Loading skeleton -->
  <div v-if="isLoading" class="animate-pulse">
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
    <div class="mb-6 flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold">{{ reminder.name }}</h1>
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
        <div>
          <p class="text-muted-foreground text-xs">{{ $t('planned.reminders.details.infoCard.email') }}</p>
          <p class="font-medium">
            {{
              reminder.notifyEmail
                ? t('planned.reminders.details.infoCard.enabled')
                : t('planned.reminders.details.infoCard.disabled')
            }}
          </p>
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
                <p v-if="period.paidAt" class="text-muted-foreground text-xs">
                  {{ $t('planned.reminders.details.period.paidAt', { date: format(period.paidAt, 'PP') }) }}
                </p>
                <p v-if="period.transactionId" class="text-muted-foreground flex items-center gap-1 text-xs">
                  <LinkIcon class="size-3" />
                  {{ $t('planned.reminders.details.period.transaction', { id: period.transactionId }) }}
                </p>
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
                  :disabled="isPeriodActionPending"
                  @click="markPaidMutation({ reminderId: reminder.id, periodId: period.id })"
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
                <UiButton variant="ghost" size="sm" :disabled="isPeriodActionPending" @click="revertTarget = period">
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
          <UiButton variant="outline" @click="isEditOpen = false">{{ $t('common.cancel') }}</UiButton>
          <UiButton
            type="submit"
            form="edit-reminder-form"
            :disabled="editFormRef?.isSubmitDisabled || isUpdating"
            :loading="isUpdating"
          >
            {{ $t('common.save') }}
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
        {{ $t('planned.reminders.dialogs.revertDescription', { date: revertTarget?.dueDate }) }}
      </template>
    </ResponsiveAlertDialog>
  </div>
</template>
