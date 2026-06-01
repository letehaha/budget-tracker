<script setup lang="ts">
import { getErrorMessage } from '@/common/utils/error-message';
import ResponsiveAlertDialog from '@/components/common/responsive-alert-dialog.vue';
import { Checkbox } from '@/components/lib/ui/checkbox';
import { NotificationType, useNotificationCenter } from '@/components/notification-center';
import { useDeleteVentureEvent, useVentureEvents } from '@/composable/data-queries/venture/events';
import EventRow from '@/pages/venture/components/event-row.vue';
import { VENTURE_CASH_FLOW_MODE, type VentureEventModel } from '@bt/shared/types';
import { computed, ref, toRef } from 'vue';
import { useI18n } from 'vue-i18n';

const props = defineProps<{
  dealId: string;
  currencyCode: string;
}>();

const dealIdRef = toRef(props, 'dealId');
const { data: events, isPending } = useVentureEvents(dealIdRef);
const { t } = useI18n();
const { addNotification } = useNotificationCenter();

const deleteMutation = useDeleteVentureEvent();

const sortedEvents = computed<VentureEventModel[]>(() => {
  if (!events.value) return [];
  return [...events.value].sort((a, b) => b.eventDate.localeCompare(a.eventDate));
});

const deleteTarget = ref<VentureEventModel | null>(null);
const deleteOpen = ref(false);
const deleteLinkedTx = ref(false);

const hasLinkedTransactions = computed(() => deleteTarget.value?.cashFlowMode === VENTURE_CASH_FLOW_MODE.linked);

const requestDelete = (event: VentureEventModel) => {
  deleteTarget.value = event;
  deleteLinkedTx.value = false;
  deleteOpen.value = true;
};

const onConfirmDelete = async () => {
  if (!deleteTarget.value) return;
  const eventId = deleteTarget.value.id;
  const deleteLinkedTransactions = hasLinkedTransactions.value ? deleteLinkedTx.value : undefined;
  try {
    await deleteMutation.mutateAsync({ eventId, deleteLinkedTransactions });
    addNotification({ text: t('venture.events.notifications.deleted'), type: NotificationType.success });
    deleteOpen.value = false;
    deleteTarget.value = null;
  } catch (err) {
    addNotification({
      text: getErrorMessage(err, t('venture.events.notifications.error')),
      type: NotificationType.error,
    });
  }
};
</script>

<template>
  <section>
    <div v-if="isPending" class="bg-muted h-24 animate-pulse rounded" />

    <div
      v-else-if="sortedEvents.length === 0"
      class="border-border bg-card text-muted-foreground rounded-xl border border-dashed py-10 text-center text-sm"
    >
      {{ $t('venture.events.emptyTimeline') }}
    </div>

    <ol v-else class="grid gap-3">
      <EventRow
        v-for="event in sortedEvents"
        :key="event.id"
        :event="event"
        :currency-code="currencyCode"
        @delete="requestDelete"
      />
    </ol>

    <ResponsiveAlertDialog
      v-model:open="deleteOpen"
      :confirm-label="$t('venture.events.deleteConfirm')"
      confirm-variant="destructive"
      @confirm="onConfirmDelete"
    >
      <template #title>{{ $t('venture.events.deleteTitle') }}</template>
      <template #description>{{ $t('venture.events.deleteDescription') }}</template>
      <label v-if="hasLinkedTransactions" class="mt-2 flex items-center gap-2 text-sm">
        <Checkbox v-model="deleteLinkedTx" />
        <span>{{ $t('venture.events.deleteLinkedTransactionsLabel') }}</span>
      </label>
    </ResponsiveAlertDialog>
  </section>
</template>
