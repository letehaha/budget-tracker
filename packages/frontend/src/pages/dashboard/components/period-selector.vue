<template>
  <DateSelector v-model="period" :presets="quickPresets" popover-class-name="md:min-w-[600px]" />
</template>

<script lang="ts" setup>
import { DateSelector, type DateSelectorPreset } from '@/components/lib/ui/date-selector';
import {
  format as dateFnsFormat,
  endOfMonth,
  endOfYear,
  isSameDay,
  startOfMonth,
  startOfYear,
  subMonths,
  subYears,
} from 'date-fns';
import { computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';

import { type Period } from '../types';

const { t } = useI18n();

const props = defineProps<{
  modelValue: Period;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: Period];
}>();

const period = computed({
  get: () => props.modelValue,
  set: (value: Period) => emit('update:modelValue', value),
});

function isCurrentMonthPeriod(p: Period): boolean {
  const now = new Date();
  return isSameDay(p.from, startOfMonth(now)) && isSameDay(p.to, endOfMonth(now));
}

// Sync period to URL using history.replaceState
watch(
  () => props.modelValue,
  (p) => {
    const url = new URL(window.location.href);

    if (isCurrentMonthPeriod(p)) {
      url.search = '';
    } else {
      url.searchParams.set('from', dateFnsFormat(p.from, 'yyyy-MM-dd'));
      url.searchParams.set('to', dateFnsFormat(p.to, 'yyyy-MM-dd'));
    }

    window.history.replaceState(history.state, '', url);
  },
  { deep: true },
);

const quickPresets = computed<DateSelectorPreset[]>(() => [
  {
    label: t('dashboard.periodSelector.presets.currentMonth'),
    getValue: () => ({
      from: startOfMonth(new Date()),
      to: endOfMonth(new Date()),
    }),
  },
  {
    label: t('dashboard.periodSelector.presets.last3Months'),
    getValue: () => ({
      from: startOfMonth(subMonths(new Date(), 2)),
      to: endOfMonth(new Date()),
    }),
  },
  {
    label: t('dashboard.periodSelector.presets.last6Months'),
    getValue: () => ({
      from: startOfMonth(subMonths(new Date(), 5)),
      to: endOfMonth(new Date()),
    }),
  },
  {
    label: t('dashboard.periodSelector.presets.lastYear'),
    getValue: () => ({
      from: startOfMonth(subMonths(new Date(), 11)),
      to: endOfMonth(new Date()),
    }),
  },
  {
    label: t('dashboard.periodSelector.presets.thisYear'),
    getValue: () => ({
      from: startOfYear(new Date()),
      to: new Date(),
    }),
  },
  {
    label: t('dashboard.periodSelector.presets.previousYear'),
    getValue: () => {
      const prevYear = subYears(new Date(), 1);
      return {
        from: startOfYear(prevYear),
        to: endOfYear(prevYear),
      };
    },
  },
]);
</script>
