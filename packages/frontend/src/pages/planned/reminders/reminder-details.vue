<script setup lang="ts">
import {
  deleteReminder,
  loadReminderById,
  loadReminderPeriods,
  markPeriodPaid,
  skipPeriod,
  unlinkPeriodTransaction,
  updateReminder,
  type PaymentReminderDetail,
} from '@/api/payment-reminders';
import ResponsiveAlertDialog from '@/components/common/responsive-alert-dialog.vue';
import ResponsiveDialog from '@/components/common/responsive-dialog.vue';
import UiButton from '@/components/lib/ui/button/Button.vue';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import { useNotificationCenter } from '@/components/notification-center';
import { useFormatCurrency } from '@/composable/formatters';
import { ApiErrorResponseError } from '@/js/errors';
import { ROUTES_NAMES } from '@/routes';
import { PAYMENT_REMINDER_STATUSES, type PaymentReminderPeriodModel } from '@bt/shared/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { format, parseISO } from 'date-fns';
import { CheckIcon, LinkIcon, PencilIcon, SkipForwardIcon, Trash2Icon, UnlinkIcon } from 'lucide-vue-next';
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import ReminderFormDialog from './components/reminder-form-dialog.vue';
import { formatFrequency, getDaysUntilDue, invalidateReminderQueries } from './utils';

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
    addErrorNotification('Reminder not found');
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
  mutationFn: (payload: Parameters<typeof updateReminder>[0]) => updateReminder(payload),
  onSuccess: () => {
    invalidateAll();
    isEditOpen.value = false;
    addSuccessNotification('Reminder updated');
  },
  onError(error) {
    const message = error instanceof ApiErrorResponseError ? error.data.message : 'Failed to update';
    editFormRef.value?.setError({ error: message ?? '' });
  },
});

// Delete
const isDeleteOpen = ref(false);
const { mutate: deleteMutation } = useMutation({
  mutationFn: deleteReminder,
  onSuccess: () => {
    addSuccessNotification('Reminder deleted');
    router.push({ name: ROUTES_NAMES.plannedReminders });
  },
  onError(error) {
    const message = error instanceof ApiErrorResponseError ? error.data.message : 'Failed to delete';
    addErrorNotification(message ?? 'Failed to delete');
  },
});

// Period actions
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
    const message = error instanceof ApiErrorResponseError ? error.data.message : 'Failed to skip';
    addErrorNotification(message ?? 'Failed to skip');
  },
});

const { mutate: unlinkMutation } = useMutation({
  mutationFn: unlinkPeriodTransaction,
  onSuccess: () => {
    invalidateAll();
    addSuccessNotification('Transaction unlinked');
  },
  onError(error) {
    const message = error instanceof ApiErrorResponseError ? error.data.message : 'Failed to unlink';
    addErrorNotification(message ?? 'Failed to unlink');
  },
});

function isPeriodActionable(dueDate: string): boolean {
  return getDaysUntilDue({ dueDate }) <= 0;
}

function getStatusBadge(status: string): { label: string; class: string } {
  switch (status) {
    case PAYMENT_REMINDER_STATUSES.paid:
      return { label: 'Paid', class: 'bg-primary/10 text-primary' };
    case PAYMENT_REMINDER_STATUSES.overdue:
      return { label: 'Overdue', class: 'bg-destructive/10 text-destructive-text' };
    case PAYMENT_REMINDER_STATUSES.skipped:
      return { label: 'Skipped', class: 'bg-muted text-muted-foreground' };
    case PAYMENT_REMINDER_STATUSES.upcoming:
      return { label: 'Upcoming', class: 'border border-border text-foreground' };
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
          {{ formatFrequency({ freq: reminder.frequency }) }}
          <template v-if="reminder.subscription"> &middot; Linked to {{ reminder.subscription.name }} </template>
        </p>
      </div>
      <div class="flex gap-2">
        <UiButton variant="outline" size="sm" @click="isEditOpen = true">
          <PencilIcon class="mr-1 size-4" />
          Edit
        </UiButton>
        <UiButton variant="outline" size="sm" @click="isDeleteOpen = true">
          <Trash2Icon class="text-destructive-text mr-1 size-4" />
          Delete
        </UiButton>
      </div>
    </div>

    <!-- Info card -->
    <div class="bg-card mb-6 rounded-lg border p-4">
      <div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div>
          <p class="text-muted-foreground text-xs">Due Date</p>
          <p class="font-medium">{{ reminder.dueDate }}</p>
        </div>
        <div v-if="reminder.expectedAmount != null">
          <p class="text-muted-foreground text-xs">Amount</p>
          <p class="font-medium">{{ formatAmountByCurrencyCode(reminder.expectedAmount!, reminder.currencyCode!) }}</p>
        </div>
        <div>
          <p class="text-muted-foreground text-xs">Email</p>
          <p class="font-medium">{{ reminder.notifyEmail ? 'Enabled' : 'Disabled' }}</p>
        </div>
        <div v-if="reminder.remindBefore?.length">
          <p class="text-muted-foreground text-xs">Remind Before</p>
          <p class="font-medium">{{ reminder.remindBefore.join(', ').replaceAll('_', ' ') }}</p>
        </div>
      </div>
    </div>

    <!-- Period History -->
    <div>
      <h2 class="text-muted-foreground mb-3 text-sm font-medium tracking-wide uppercase">Payment History</h2>

      <div v-if="!periods.length" class="text-muted-foreground py-8 text-center text-sm">No payment periods yet.</div>

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
                <p class="text-sm font-medium">Due {{ period.dueDate }}</p>
                <p v-if="period.paidAt" class="text-muted-foreground text-xs">Paid {{ format(period.paidAt, 'PP') }}</p>
                <p v-if="period.transactionId" class="text-muted-foreground flex items-center gap-1 text-xs">
                  <LinkIcon class="size-3" />
                  Transaction #{{ period.transactionId }}
                </p>
                <p v-if="period.notes" class="text-muted-foreground text-xs italic">
                  {{ period.notes }}
                </p>
              </div>
            </div>

            <div class="flex items-center gap-1">
              <UiButton
                v-if="
                  (period.status === PAYMENT_REMINDER_STATUSES.upcoming ||
                    period.status === PAYMENT_REMINDER_STATUSES.overdue) &&
                  isPeriodActionable(period.dueDate)
                "
                variant="ghost"
                size="sm"
                title="Mark as paid"
                @click="markPaidMutation({ reminderId: reminder.id, periodId: period.id })"
              >
                <CheckIcon class="size-4" />
              </UiButton>
              <UiButton
                v-if="
                  (period.status === PAYMENT_REMINDER_STATUSES.upcoming ||
                    period.status === PAYMENT_REMINDER_STATUSES.overdue) &&
                  isPeriodActionable(period.dueDate)
                "
                variant="ghost"
                size="sm"
                title="Skip"
                @click="skipMutation({ reminderId: reminder.id, periodId: period.id })"
              >
                <SkipForwardIcon class="size-4" />
              </UiButton>
              <UiButton
                v-if="period.transactionId"
                variant="ghost"
                size="sm"
                title="Unlink transaction"
                @click="unlinkMutation({ reminderId: reminder.id, periodId: period.id })"
              >
                <UnlinkIcon class="size-4" />
              </UiButton>
            </div>
          </div>
        </div>
      </div>

      <UiButton v-if="hasMore" variant="outline" class="mt-4 w-full" @click="loadMore"> Load more </UiButton>
    </div>

    <!-- Edit dialog -->
    <ResponsiveDialog v-model:open="isEditOpen" dialog-content-class="max-w-lg">
      <template #title>Edit Reminder</template>
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
          <UiButton variant="outline" @click="isEditOpen = false">Cancel</UiButton>
          <UiButton
            type="submit"
            form="edit-reminder-form"
            :disabled="editFormRef?.isSubmitDisabled || isUpdating"
            :loading="isUpdating"
          >
            Save
          </UiButton>
        </div>
      </template>
    </ResponsiveDialog>

    <!-- Delete confirmation -->
    <ResponsiveAlertDialog
      :open="isDeleteOpen"
      confirm-label="Delete"
      confirm-variant="destructive"
      @update:open="isDeleteOpen = $event"
      @confirm="deleteMutation({ id: reminder.id })"
      @cancel="isDeleteOpen = false"
    >
      <template #title>Delete Reminder</template>
      <template #description>
        Are you sure you want to delete "{{ reminder.name }}"? This will remove all payment history.
      </template>
    </ResponsiveAlertDialog>
  </div>
</template>
