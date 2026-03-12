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
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import { useNotificationCenter } from '@/components/notification-center';
import { useFormatCurrency } from '@/composable/formatters';
import { ApiErrorResponseError } from '@/js/errors';
import { ROUTES_NAMES } from '@/routes';
import { PAYMENT_REMINDER_STATUSES, type PaymentReminderStatus } from '@bt/shared/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { BellRingIcon, CheckIcon, PlusIcon, SkipForwardIcon, Trash2Icon } from 'lucide-vue-next';
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';

import ReminderFormDialog from './components/reminder-form-dialog.vue';
import { formatFrequency, getDaysUntilDue, invalidateReminderQueries } from './utils';

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
    addSuccessNotification('Reminder created');
  },
  onError(error) {
    const message = error instanceof ApiErrorResponseError ? error.data.message : 'Failed to create reminder';
    createFormRef.value?.setError({ error: message ?? '' });
  },
});

// Delete
const deleteTarget = ref<PaymentReminderListItem | null>(null);
const { mutate: deleteMutation } = useMutation({
  mutationFn: deleteReminder,
  onSuccess: () => {
    invalidateAll();
    deleteTarget.value = null;
    addSuccessNotification('Reminder deleted');
  },
  onError(error) {
    const message = error instanceof ApiErrorResponseError ? error.data.message : 'Failed to delete reminder';
    addErrorNotification(message ?? 'Failed to delete reminder');
  },
});

// Quick actions
const { mutate: markPaidMutation } = useMutation({
  mutationFn: markPeriodPaid,
  onSuccess: () => {
    invalidateAll();
    addSuccessNotification('Marked as paid');
  },
  onError(error) {
    const message = error instanceof ApiErrorResponseError ? error.data.message : 'Failed to mark as paid';
    addErrorNotification(message ?? 'Failed to mark as paid');
  },
});

const { mutate: skipMutation } = useMutation({
  mutationFn: skipPeriod,
  onSuccess: () => {
    invalidateAll();
    addSuccessNotification('Period skipped');
  },
  onError(error) {
    const message = error instanceof ApiErrorResponseError ? error.data.message : 'Failed to skip period';
    addErrorNotification(message ?? 'Failed to skip period');
  },
});

function getDueLabel(dueDate: string, status: PaymentReminderStatus): string {
  if (status === PAYMENT_REMINDER_STATUSES.overdue) {
    const days = Math.abs(getDaysUntilDue({ dueDate }));
    return `Overdue by ${days} day${days !== 1 ? 's' : ''}`;
  }
  const days = getDaysUntilDue({ dueDate });
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  return `Due in ${days} days`;
}

function isPeriodDueOrOverdue(dueDate: string): boolean {
  return getDaysUntilDue({ dueDate }) <= 0;
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
      <h1 class="text-2xl font-bold">Payment Reminders</h1>
      <UiButton @click="isCreateDialogOpen = true">
        <PlusIcon class="mr-1 size-4" />
        New Reminder
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
        <p class="text-lg font-medium">No reminders yet</p>
        <p class="text-muted-foreground text-sm">Create your first reminder to get started.</p>
      </div>
      <UiButton @click="isCreateDialogOpen = true">
        <PlusIcon class="mr-1 size-4" />
        New Reminder
      </UiButton>
    </div>

    <!-- Upcoming / Active reminders -->
    <template v-else>
      <div v-if="activeReminders.length" class="mb-8">
        <h2 class="text-muted-foreground mb-3 text-sm font-medium tracking-wide uppercase">Upcoming</h2>
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
                  {{ formatFrequency({ freq: reminder.frequency }) }}
                </span>
              </div>

              <template v-for="period in reminder.periods" :key="period.id">
                <p
                  :class="[
                    'mt-1 text-sm',
                    period.status === PAYMENT_REMINDER_STATUSES.overdue
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
              <UiButton
                v-if="reminder.periods?.[0] && isPeriodDueOrOverdue(reminder.periods[0].dueDate)"
                variant="ghost"
                size="sm"
                title="Mark as paid"
                @click="
                  markPaidMutation({
                    reminderId: reminder.id,
                    periodId: reminder.periods[0].id,
                  })
                "
              >
                <CheckIcon class="size-4" />
              </UiButton>
              <UiButton
                v-if="reminder.periods?.[0] && isPeriodDueOrOverdue(reminder.periods[0].dueDate)"
                variant="ghost"
                size="sm"
                title="Skip period"
                @click="
                  skipMutation({
                    reminderId: reminder.id,
                    periodId: reminder.periods[0].id,
                  })
                "
              >
                <SkipForwardIcon class="size-4" />
              </UiButton>
              <UiButton variant="ghost" size="sm" title="Delete" @click="deleteTarget = reminder">
                <Trash2Icon class="text-destructive-text size-4" />
              </UiButton>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- Create dialog -->
    <ResponsiveDialog v-model:open="isCreateDialogOpen" dialog-content-class="max-w-lg">
      <template #title>New Reminder</template>
      <ReminderFormDialog
        ref="createFormRef"
        form-id="create-reminder-form"
        @submit="createReminderMutation"
        @cancel="isCreateDialogOpen = false"
      />
      <template #footer>
        <div class="flex justify-end gap-2">
          <UiButton variant="outline" @click="isCreateDialogOpen = false">Cancel</UiButton>
          <UiButton
            type="submit"
            form="create-reminder-form"
            :disabled="createFormRef?.isSubmitDisabled || isCreating"
            :loading="isCreating"
          >
            Create
          </UiButton>
        </div>
      </template>
    </ResponsiveDialog>

    <!-- Delete confirmation -->
    <ResponsiveAlertDialog
      :open="!!deleteTarget"
      confirm-label="Delete"
      confirm-variant="destructive"
      @update:open="
        (val: boolean) => {
          if (!val) deleteTarget = null;
        }
      "
      @confirm="deleteTarget && deleteMutation({ id: deleteTarget.id })"
      @cancel="deleteTarget = null"
    >
      <template #title>Delete Reminder</template>
      <template #description>
        Are you sure you want to delete "{{ deleteTarget?.name }}"? This will remove all payment history.
      </template>
    </ResponsiveAlertDialog>
  </div>
</template>
