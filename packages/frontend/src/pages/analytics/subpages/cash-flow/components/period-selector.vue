<template>
  <div
    :class="
      cn(
        'flex items-center justify-center gap-0.5',
        variant === 'solid' && 'border-input bg-input-background h-9 rounded-md border px-0.5',
      )
    "
  >
    <Button size="icon-sm" variant="ghost" @click="selectPrevPeriod">
      <ChevronLeft :size="16" />
    </Button>

    <DateSelector v-model="period" :presets="quickPresets" :earliest-date="earliestDate">
      <template #trigger="{ triggerText }">
        <Button
          variant="ghost"
          size="sm"
          :class="cn('hover:bg-accent min-w-55 font-medium', variant === 'solid' && 'h-8')"
        >
          <CalendarIcon class="mr-1.5 size-3.5" />
          {{ triggerText }}
        </Button>
      </template>
    </DateSelector>

    <Button size="icon-sm" variant="ghost" :disabled="isNextDisabled" @click="selectNextPeriod">
      <ChevronRight :size="16" />
    </Button>
  </div>
</template>

<script lang="ts" setup>
import Button from '@/components/lib/ui/button/Button.vue';
import { DateSelector, type DateSelectorPreset } from '@/components/lib/ui/date-selector';
import { cn } from '@/lib/utils';
import { useEarliestTransactionDate } from '@/composable/data-queries/earliest-transaction-date';
import { type Period, usePeriodNavigation } from '@/composable/use-period-navigation';
import { endOfMonth, endOfYear, isAfter, startOfMonth, startOfYear, subMonths, subYears } from 'date-fns';
import { CalendarIcon, ChevronLeft, ChevronRight } from '@lucide/vue';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const props = withDefaults(
  defineProps<{
    modelValue: Period;
    variant?: 'ghost' | 'solid';
  }>(),
  { variant: 'ghost' },
);

const emit = defineEmits<{
  'update:modelValue': [value: Period];
}>();

const period = computed({
  get: () => props.modelValue,
  set: (value: Period) => emit('update:modelValue', value),
});

const { prevPeriod, nextPeriod } = usePeriodNavigation({
  period: () => props.modelValue,
});

const { earliestDate } = useEarliestTransactionDate();

const isNextDisabled = computed(() => isAfter(nextPeriod.value.from, new Date()));

function selectPrevPeriod() {
  period.value = prevPeriod.value;
}

function selectNextPeriod() {
  period.value = nextPeriod.value;
}

const quickPresets = computed<DateSelectorPreset[]>(() => [
  {
    label: t('analytics.cashFlow.periods.last3Months'),
    getValue: () => ({
      from: startOfMonth(subMonths(new Date(), 2)),
      to: endOfMonth(new Date()),
    }),
  },
  {
    label: t('analytics.cashFlow.periods.last6Months'),
    getValue: () => ({
      from: startOfMonth(subMonths(new Date(), 5)),
      to: endOfMonth(new Date()),
    }),
  },
  {
    label: t('analytics.cashFlow.periods.last12Months'),
    getValue: () => ({
      from: startOfMonth(subMonths(new Date(), 11)),
      to: endOfMonth(new Date()),
    }),
  },
  {
    label: t('analytics.cashFlow.periods.thisYear'),
    getValue: () => ({
      from: startOfYear(new Date()),
      to: new Date(),
    }),
  },
  {
    label: t('analytics.cashFlow.periods.previousYear'),
    getValue: () => {
      const prevYear = subYears(new Date(), 1);
      return {
        from: startOfYear(prevYear),
        to: endOfYear(prevYear),
      };
    },
  },
  {
    label: t('analytics.cashFlow.periods.allTime'),
    // Fallback start covers the case where the earliest-date query hasn't resolved:
    // far enough back to include any realistic personal-finance history.
    getValue: () => ({
      from: earliestDate.value ?? new Date(2000, 0, 1),
      to: new Date(),
    }),
  },
]);
</script>
