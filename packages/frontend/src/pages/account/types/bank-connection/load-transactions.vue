<script lang="ts" setup>
import { loadTransactionsForPeriod as apiLoadTransactions } from '@/api/bank-data-providers';
import { Button } from '@/components/lib/ui/button';
import { Calendar } from '@/components/lib/ui/calendar';
import * as Popover from '@/components/lib/ui/popover';
import { NotificationType, useNotificationCenter } from '@/components/notification-center';
import { useSyncJobPolling } from '@/composables/useSyncJobPolling';
import { AccountModel } from '@bt/shared/types';
import { differenceInDays, format, subDays } from 'date-fns';
import { CalendarIcon } from 'lucide-vue-next';
import { computed, ref } from 'vue';

const props = defineProps<{
  account: AccountModel;
}>();

const { addNotification } = useNotificationCenter();
const { startPolling, activeJobIds } = useSyncJobPolling();

// Check if there's an active sync job for this account
const hasActiveSync = computed(() => {
  // Job ID pattern: userId-accountId-timestamp
  return activeJobIds.value.some((jobId) => {
    const parts = jobId.split('-');
    return parts[1] === String(props.account.id);
  });
});

const INITIAL_FORM_VALUE = {
  start: subDays(new Date(), 1),
  end: subDays(new Date(), 1),
};

const selectorVisible = ref(false);
const dateRange = ref(INITIAL_FORM_VALUE);
const isLoading = ref(false);

const loadTransactionsForPeriod = async () => {
  if (!props.account.bankDataProviderConnectionId) {
    addNotification({
      text: 'This account is not linked to a bank connection',
      type: NotificationType.error,
    });
    return;
  }

  try {
    const { start, end } = dateRange.value;

    // Validate date range (max 1 year)
    const daysDiff = differenceInDays(end, start);
    if (daysDiff > 365) {
      addNotification({
        text: 'Date range cannot exceed 1 year',
        type: NotificationType.error,
      });
      return;
    }

    isLoading.value = true;

    const result = await apiLoadTransactions(
      props.account.bankDataProviderConnectionId,
      props.account.id,
      start.toISOString(),
      end.toISOString(),
    );

    addNotification({
      text: `${result.message}. Processing ${result.totalBatches} batch(es)...`,
      type: NotificationType.info,
    });

    dateRange.value = INITIAL_FORM_VALUE;
    selectorVisible.value = false;

    // Start polling for progress using global composable
    startPolling(result.jobGroupId, props.account.bankDataProviderConnectionId);
  } catch (error) {
    const e = error as { data?: { message?: string } };
    addNotification({
      text: e?.data?.message || 'Failed to load transactions',
      type: NotificationType.error,
      visibilityTime: 10_000, // 10 seconds for error messages to give user time to read
    });
  } finally {
    isLoading.value = false;
  }
};
</script>

<template>
  <div class="flex items-center justify-between">
    <p>Load transactions for selected period</p>

    <Popover.Popover :open="selectorVisible" @update:open="selectorVisible = $event">
      <Popover.PopoverTrigger as-child>
        <Button :disabled="isLoading || hasActiveSync" class="min-w-[100px]" size="sm">
          {{ isLoading || hasActiveSync ? 'Loading...' : 'Select period' }}
        </Button>
      </Popover.PopoverTrigger>

      <Popover.PopoverContent class="grid w-[600px] gap-3">
        <div class="flex items-center justify-center gap-2">
          <CalendarIcon />
          <span>
            {{ format(dateRange.start, 'MMM dd, yyyy') }} -
            {{ format(dateRange.end, 'MMM dd, yyyy') }}
          </span>
        </div>

        <Calendar
          v-model.range="dateRange"
          type="range"
          :disabled-dates="[{ start: new Date(), end: null }]"
          :columns="2"
        />

        <div class="flex justify-end">
          <Button :disabled="isLoading" @click="loadTransactionsForPeriod"> Load transactions </Button>
        </div>
      </Popover.PopoverContent>
    </Popover.Popover>
  </div>
</template>
