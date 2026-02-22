<template>
  <div class="flex items-center gap-3">
    <div class="min-w-0 flex-1">
      <DateSelector
        :model-value="currentPeriod"
        :presets="presets"
        popover-class-name="md:min-w-150"
        @update:model-value="handlePeriodUpdate"
      >
        <template #trigger="{ triggerText }">
          <Button
            variant="outline"
            :class="['w-full justify-start text-left font-normal', !hasDates && 'text-muted-foreground']"
          >
            <CalendarIcon class="mr-2 size-4" />
            {{ hasDates ? triggerText : $t('transactions.filters.dateRange.selectDateOrRange') }}
          </Button>
        </template>
      </DateSelector>
    </div>

    <Button v-if="hasDates" variant="soft-destructive" size="icon" @click="clearDates">
      <XIcon class="size-4" />
    </Button>
  </div>
</template>

<script lang="ts" setup>
import { Button } from '@/components/lib/ui/button';
import { DateSelector, type DateSelectorPreset } from '@/components/lib/ui/date-selector';
import { type Period } from '@/composable/use-period-navigation';
import { endOfDay, endOfMonth, startOfDay, startOfMonth, subMonths } from 'date-fns';
import { CalendarIcon, XIcon } from 'lucide-vue-next';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

const props = defineProps({
  start: {
    type: Date,
    default: null,
  },
  end: {
    type: Date,
    default: null,
  },
});

const emit = defineEmits(['update:range']);

const { t } = useI18n();

const hasDates = computed(() => props.start !== null && props.end !== null);

const currentPeriod = computed<Period>(() => ({
  from: props.start ?? startOfMonth(new Date()),
  to: props.end ?? endOfMonth(new Date()),
}));

const presets = computed<DateSelectorPreset[]>(() => [
  {
    label: t('transactions.filters.dateRange.presets.thisMonth'),
    getValue: () => ({
      from: startOfMonth(new Date()),
      to: endOfDay(new Date()),
    }),
  },
  {
    label: t('transactions.filters.dateRange.presets.last3Months'),
    getValue: () => ({
      from: startOfDay(subMonths(new Date(), 3)),
      to: endOfDay(new Date()),
    }),
  },
  {
    label: t('transactions.filters.dateRange.presets.last6Months'),
    getValue: () => ({
      from: startOfDay(subMonths(new Date(), 6)),
      to: endOfDay(new Date()),
    }),
  },
  {
    label: t('transactions.filters.dateRange.presets.last12Months'),
    getValue: () => ({
      from: startOfDay(subMonths(new Date(), 12)),
      to: endOfDay(new Date()),
    }),
  },
]);

function handlePeriodUpdate(period: Period) {
  emit('update:range', { start: period.from, end: period.to });
}

function clearDates() {
  emit('update:range', { start: null, end: null });
}
</script>
