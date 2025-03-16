<script lang="ts" setup>
import { Button } from '@/components/lib/ui/button';
import { Calendar } from '@/components/lib/ui/calendar';
import * as Popover from '@/components/lib/ui/popover';
import { NotificationType, useNotificationCenter } from '@/components/notification-center';
import { useBanksMonobankStore } from '@/stores';
import { AccountModel } from '@bt/shared/types';
import { format, subDays } from 'date-fns';
import { CalendarIcon } from 'lucide-vue-next';
import { ref } from 'vue';

const props = defineProps<{
  account: AccountModel;
}>();
const { addNotification } = useNotificationCenter();
const monobankStore = useBanksMonobankStore();

const INITIAL_FORM_VALUE = {
  start: subDays(new Date(), 1),
  end: subDays(new Date(), 1),
};

const selectorVisible = ref(false);
const dateRange = ref(INITIAL_FORM_VALUE);

const loadTransactionsForPeriod = async () => {
  try {
    const { start, end } = dateRange.value;

    await monobankStore.loadTransactionsForPeriod({
      accountId: props.account.id,
      from: start.getTime(),
      to: end.getTime(),
    });

    addNotification({
      text: 'Loaded successfully',
      type: NotificationType.success,
    });

    dateRange.value = INITIAL_FORM_VALUE;
    selectorVisible.value = false;
  } catch (err) {
    addNotification({
      text: 'Unexpected error',
      type: NotificationType.error,
    });
  }
};
</script>

<template>
  <div class="flex items-center justify-between">
    <p>Load transactions for selected period</p>

    <Popover.Popover :open="selectorVisible" @update:open="selectorVisible = $event">
      <Popover.PopoverTrigger>
        <Button class="min-w-[100px]" size="sm"> Select period </Button>
      </Popover.PopoverTrigger>

      <Popover.PopoverContent class="w-[600px] grid gap-3">
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
          <Button @click="loadTransactionsForPeriod"> Load transactions </Button>
        </div>
      </Popover.PopoverContent>
    </Popover.Popover>
  </div>
</template>
