<script setup lang="ts">
import {
  createReminder,
  deleteReminder,
  loadReminders,
  markPeriodPaid,
  skipPeriod,
  type PaymentReminderListItem,
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
import { PAYMENT_REMINDER_STATUSES, type PaymentReminderStatus } from '@bt/shared/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { BellRingIcon, CheckIcon, PlusIcon, SkipForwardIcon, Trash2Icon } from 'lucide-vue-next';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';

import ReminderFormDialog from './components/reminder-form-dialog.vue';
import { getDaysUntilDue, getFrequencyI18nKey, invalidateReminderQueries, isStatusActionable } from './utils';

const { t } = useI18n();
const router = useRouter();
const queryClient = useQueryClient();
const { addSuccessNotification, addErrorNotification } = useNotificationCenter();
const { formatAmountByCurrencyCode } = useFormatCurrency();

const { data: reminders, isPlaceholderData } = useQuery({
  queryFn: () => loadReminders(),
  queryKey: VUE_QUERY_CACHE_KEYS.remindersList,
  staleTime: Infinity,
  placeholderData: [],
});

// Split into upcoming/overdue vs completed
const activeReminders = computed(() => {
  if (!reminders.value) return [];
  return reminders.value
    .filter((r) => {
      const hasActivePeriod = r.periods?.some(
        (p) => p.status === PAYMENT_REMINDER_STATUSES.upcoming || p.status === PAYMENT_REMINDER_STATUSES.overdue,
      );
      return r.isActive && hasActivePeriod;
    })
    .sort((a, b) => {
      const aDate = a.periods?.[0]?.dueDate ?? '9999-12-31';
      const bDate = b.periods?.[0]?.dueDate ?? '9999-12-31';
      return aDate.localeCompare(bDate);
    });
});

// Create dialog
const isCreateDialogOpen = ref(false);
const createFormRef = ref<InstanceType<typeof ReminderFormDialog>>();

const invalidateAll = () => invalidateReminderQueries({ queryClient });

const { mutate: createReminderMutation, isPending: isCreating } = useMutation({
  mutationFn: createReminder,
  onSuccess: () => {
    invalidateAll();
    isCreateDialogOpen.value = false;
    addSuccessNotification(t('planned.reminders.notifications.created'));
  },
  onError(error) {
    const message =
      error instanceof ApiErrorResponseError ? error.data.message : t('planned.reminders.notifications.createFailed');
    createFormRef.value?.setError({ error: message ?? '' });
  },
});

// Delete
const deleteTarget = ref<PaymentReminderListItem | null>(null);
const { mutate: deleteMutation, isPending: isDeleting } = useMutation({
  mutationFn: deleteReminder,
  onSuccess: () => {
    invalidateAll();
    deleteTarget.value = null;
    addSuccessNotification(t('planned.reminders.notifications.deleted'));
  },
  onError(error) {
    const message =
      error instanceof ApiErrorResponseError ? error.data.message : t('planned.reminders.notifications.deleteFailed');
    addErrorNotification(message ?? t('planned.reminders.notifications.deleteFailed'));
  },
});

// Quick actions
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

const isQuickActionPending = computed(() => isMarkingPaid.value || isSkipping.value || isDeleting.value);

function getDueLabel(dueDate: string, status: PaymentReminderStatus): string {
  if (status === PAYMENT_REMINDER_STATUSES.overdue) {
    const days = Math.abs(getDaysUntilDue({ dueDate }));
    return t('planned.reminders.list.dueLabels.overdueBy', { days }, days);
  }
  const days = getDaysUntilDue({ dueDate });
  if (days === 0) return t('planned.reminders.list.dueLabels.today');
  if (days === 1) return t('planned.reminders.list.dueLabels.tomorrow');
  return t('planned.reminders.list.dueLabels.inDays', { days });
}

function formatAmount({ reminder }: { reminder: PaymentReminderListItem }): string | null {
  if (reminder.expectedAmount == null || !reminder.currencyCode) return null;
  return formatAmountByCurrencyCode(reminder.expectedAmount, reminder.currencyCode);
}
</script>

<template>
  <div>
    <!-- Header -->
    <div class="mb-6 flex items-center justify-between">
      <h1 class="text-2xl font-bold">{{ $t('planned.reminders.title') }}</h1>
      <UiButton @click="isCreateDialogOpen = true">
        <PlusIcon class="mr-1 size-4" />
        {{ $t('planned.reminders.newReminder') }}
      </UiButton>
    </div>

    <!-- Loading skeleton -->
    <div v-if="isPlaceholderData" class="grid gap-3">
      <div v-for="i in 3" :key="i" class="bg-muted/50 h-20 animate-pulse rounded-lg" />
    </div>

    <!-- Empty state -->
    <div v-else-if="!reminders?.length" class="flex flex-col items-center justify-center gap-4 py-16 text-center">
      <BellRingIcon class="text-muted-foreground size-12" />
      <div>
        <p class="text-lg font-medium">{{ $t('planned.reminders.emptyState.title') }}</p>
        <p class="text-muted-foreground text-sm">{{ $t('planned.reminders.emptyState.description') }}</p>
      </div>
      <UiButton @click="isCreateDialogOpen = true">
        <PlusIcon class="mr-1 size-4" />
        {{ $t('planned.reminders.newReminder') }}
      </UiButton>
    </div>

    <!-- Upcoming / Active reminders -->
    <template v-else>
      <div v-if="activeReminders.length" class="mb-8">
        <h2 class="text-muted-foreground mb-3 text-sm font-medium tracking-wide uppercase">
          {{ $t('planned.reminders.list.upcoming') }}
        </h2>
        <div class="grid gap-3">
          <div
            v-for="reminder in activeReminders"
            :key="reminder.id"
            class="bg-card hover:bg-accent/50 flex cursor-pointer items-center justify-between rounded-lg border p-4 transition-colors"
            @click="router.push({ name: ROUTES_NAMES.plannedReminderDetails, params: { id: reminder.id } })"
          >
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <p class="truncate font-medium">{{ reminder.name }}</p>
                <span class="text-muted-foreground text-xs">
                  {{ $t(getFrequencyI18nKey({ freq: reminder.frequency })) }}
                </span>
              </div>

              <template v-for="period in reminder.periods" :key="period.id">
                <p
                  :class="[
                    'mt-1 text-sm',
                    period.status === PAYMENT_REMINDER_STATUSES.overdue ||
                    (period.status === PAYMENT_REMINDER_STATUSES.upcoming &&
                      getDaysUntilDue({ dueDate: period.dueDate }) <= 7)
                      ? 'text-destructive-text font-medium'
                      : 'text-muted-foreground',
                  ]"
                >
                  {{ getDueLabel(period.dueDate, period.status) }}
                  <span v-if="formatAmount({ reminder })"> &middot; {{ formatAmount({ reminder }) }} </span>
                </p>
              </template>
            </div>

            <div class="flex items-center gap-1" @click.stop>
              <DesktopOnlyTooltip
                v-if="reminder.periods?.[0] && isStatusActionable({ status: reminder.periods[0].status })"
                :content="$t('planned.reminders.list.tooltips.markAsPaid')"
              >
                <UiButton
                  variant="soft-success"
                  size="icon"
                  :disabled="isQuickActionPending"
                  @click="
                    markPaidMutation({
                      reminderId: reminder.id,
                      periodId: reminder.periods[0].id,
                    })
                  "
                >
                  <CheckIcon class="size-4" />
                </UiButton>
              </DesktopOnlyTooltip>
              <DesktopOnlyTooltip
                v-if="reminder.periods?.[0] && isStatusActionable({ status: reminder.periods[0].status })"
                :content="$t('planned.reminders.list.tooltips.skipPeriod')"
              >
                <UiButton
                  variant="ghost"
                  size="icon"
                  :disabled="isQuickActionPending"
                  @click="
                    skipMutation({
                      reminderId: reminder.id,
                      periodId: reminder.periods[0].id,
                    })
                  "
                >
                  <SkipForwardIcon class="size-4" />
                </UiButton>
              </DesktopOnlyTooltip>
              <DesktopOnlyTooltip :content="$t('planned.reminders.list.tooltips.delete')">
                <UiButton variant="soft-destructive" size="icon" @click="deleteTarget = reminder">
                  <Trash2Icon class="size-4" />
                </UiButton>
              </DesktopOnlyTooltip>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- Create dialog -->
    <ResponsiveDialog v-model:open="isCreateDialogOpen" dialog-content-class="max-w-lg">
      <template #title>{{ $t('planned.reminders.newReminder') }}</template>
      <ReminderFormDialog
        ref="createFormRef"
        form-id="create-reminder-form"
        @submit="createReminderMutation"
        @cancel="isCreateDialogOpen = false"
      />
      <template #footer>
        <div class="flex justify-end gap-2">
          <UiButton variant="outline" @click="isCreateDialogOpen = false">{{ $t('common.cancel') }}</UiButton>
          <UiButton
            type="submit"
            form="create-reminder-form"
            :disabled="createFormRef?.isSubmitDisabled || isCreating"
            :loading="isCreating"
          >
            {{ $t('common.create') }}
          </UiButton>
        </div>
      </template>
    </ResponsiveDialog>

    <!-- Delete confirmation -->
    <ResponsiveAlertDialog
      :open="!!deleteTarget"
      :confirm-label="$t('planned.reminders.delete')"
      confirm-variant="destructive"
      @update:open="
        (val: boolean) => {
          if (!val) deleteTarget = null;
        }
      "
      @confirm="deleteTarget && deleteMutation({ id: deleteTarget.id })"
      @cancel="deleteTarget = null"
    >
      <template #title>{{ $t('planned.reminders.dialogs.deleteTitle') }}</template>
      <template #description>
        {{ $t('planned.reminders.dialogs.deleteDescription', { name: deleteTarget?.name }) }}
      </template>
    </ResponsiveAlertDialog>
  </div>
</template>
