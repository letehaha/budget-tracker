<template>
  <div class="flex items-center justify-center gap-1">
    <ui-button size="icon" variant="ghost" @click="selectPrevPeriod">
      <ChevronLeft :size="20" />
    </ui-button>

    <Popover v-model:open="isCalendarOpen">
      <PopoverTrigger as-child>
        <ui-button variant="ghost" class="hover:bg-accent min-w-[220px] font-normal">
          <CalendarIcon class="mr-2 size-4" />
          {{ periodSelectorText }}
        </ui-button>
      </PopoverTrigger>
      <PopoverContent class="w-auto p-4" align="center" side="top" :side-offset="8">
        <div class="xs:gap-4 flex">
          <!-- Quick actions sidebar -->
          <div class="xs:pr-4 flex flex-col gap-2 border-r pr-2">
            <div class="text-muted-foreground mb-2 text-sm font-semibold">Quick Select</div>
            <ui-button
              v-for="preset in quickPresets"
              :key="preset.label"
              size="sm"
              variant="ghost"
              :class="{ 'bg-accent': isPresetActive(preset) }"
              class="max-xs:px-0 justify-start whitespace-nowrap"
              @click="applyPreset(preset)"
            >
              {{ preset.label }}
            </ui-button>
          </div>

          <!-- Calendar -->
          <RangeCalendar
            :model-value="calendarValue"
            :number-of-months="2"
            @update:model-value="handleDateRangeSelect"
          />
        </div>
      </PopoverContent>
    </Popover>

    <ui-button size="icon" variant="ghost" :disabled="isNextDisabled" @click="selectNextPeriod">
      <ChevronRight :size="20" />
    </ui-button>
  </div>
</template>

<script lang="ts" setup>
import UiButton from '@/components/lib/ui/button/Button.vue';
import Popover from '@/components/lib/ui/popover/Popover.vue';
import PopoverContent from '@/components/lib/ui/popover/PopoverContent.vue';
import PopoverTrigger from '@/components/lib/ui/popover/PopoverTrigger.vue';
import RangeCalendar from '@/components/lib/ui/range-calendar/RangeCalendar.vue';
import { CalendarDate, type DateValue } from '@internationalized/date';
import {
  addDays,
  differenceInDays,
  endOfMonth,
  endOfYear,
  format,
  isSameMonth,
  startOfMonth,
  startOfYear,
  subDays,
  subMonths,
  subYears,
} from 'date-fns';
import { CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-vue-next';
import { type DateRange } from 'reka-ui';
import { computed, ref, watch } from 'vue';

import { type Period } from '../types';

interface PeriodPreset {
  label: string;
  getValue: () => Period;
}

const props = defineProps<{
  modelValue: Period;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: Period];
}>();

// Helper functions to convert between Date and DateValue
const dateToCalendarDate = (date: Date): CalendarDate => {
  return new CalendarDate(date.getFullYear(), date.getMonth() + 1, date.getDate());
};

const calendarDateToDate = (calendarDate: DateValue): Date => {
  return new Date(calendarDate.year, calendarDate.month - 1, calendarDate.day);
};

const isCalendarOpen = ref(false);

// Check if period is the default "current month" (compare dates only, ignore time)
const isCurrentMonthPeriod = (period: Period) => {
  const now = new Date();
  const currentMonthStart = startOfMonth(now);
  const currentMonthEnd = endOfMonth(now);

  return (
    period.from.getFullYear() === currentMonthStart.getFullYear() &&
    period.from.getMonth() === currentMonthStart.getMonth() &&
    period.from.getDate() === currentMonthStart.getDate() &&
    period.to.getFullYear() === currentMonthEnd.getFullYear() &&
    period.to.getMonth() === currentMonthEnd.getMonth() &&
    period.to.getDate() === currentMonthEnd.getDate()
  );
};

// Sync period to URL using history.replaceState to avoid scroll reset on mobile
// Clear query when default period (current month) is selected
watch(
  () => props.modelValue,
  (period) => {
    const url = new URL(window.location.href);

    if (isCurrentMonthPeriod(period)) {
      url.search = '';
    } else {
      url.searchParams.set('from', format(period.from, 'yyyy-MM-dd'));
      url.searchParams.set('to', format(period.to, 'yyyy-MM-dd'));
    }

    window.history.replaceState(history.state, '', url);
  },
  { deep: true },
);

// Calendar value for the RangeCalendar component
const calendarValue = computed(() => ({
  start: dateToCalendarDate(props.modelValue.from),
  end: dateToCalendarDate(props.modelValue.to),
}));

// Quick preset buttons
const quickPresets: PeriodPreset[] = [
  {
    label: 'Current Month',
    getValue: () => ({
      from: startOfMonth(new Date()),
      to: endOfMonth(new Date()),
    }),
  },
  {
    label: 'Last 3 Months',
    getValue: () => ({
      from: startOfMonth(subMonths(new Date(), 2)),
      to: endOfMonth(new Date()),
    }),
  },
  {
    label: 'Last 6 Months',
    getValue: () => ({
      from: startOfMonth(subMonths(new Date(), 5)),
      to: endOfMonth(new Date()),
    }),
  },
  {
    label: 'Last Year',
    getValue: () => ({
      from: startOfMonth(subMonths(new Date(), 11)),
      to: endOfMonth(new Date()),
    }),
  },
  {
    label: 'This Year',
    getValue: () => ({
      from: startOfYear(new Date()),
      to: new Date(),
    }),
  },
  {
    label: 'Previous Year',
    getValue: () => {
      const prevYear = subYears(new Date(), 1);
      return {
        from: startOfYear(prevYear),
        to: endOfYear(prevYear),
      };
    },
  },
];

const isNextDisabled = computed(() => isSameMonth(new Date(), props.modelValue.to));

const periodSelectorText = computed(() => {
  const from = props.modelValue.from;
  const to = props.modelValue.to;

  // Check if it's current month up to today
  if (isSameMonth(new Date(), to) && isSameMonth(from, to)) {
    return 'Current Month';
  }

  // Check if it's a full year
  const isFullYear = from.getMonth() === 0 && from.getDate() === 1 && to.getMonth() === 11 && to.getDate() === 31;
  if (isFullYear) {
    return `Year ${from.getFullYear()}`;
  }

  // Check if same month
  if (isSameMonth(from, to)) {
    return format(from, 'MMM yyyy');
  }

  // Check if same year
  if (from.getFullYear() === to.getFullYear()) {
    return `${format(from, 'dd MMM')} - ${format(to, 'dd MMM yyyy')}`;
  }

  // Different years
  return `${format(from, 'dd MMM yyyy')} - ${format(to, 'dd MMM yyyy')}`;
});

// Calculate period duration to shift by the same amount
const periodDurationDays = computed(() => differenceInDays(props.modelValue.to, props.modelValue.from) + 1);

const updatePeriod = (period: Period) => {
  emit('update:modelValue', period);
};

const selectPrevPeriod = () => {
  const from = subDays(props.modelValue.from, periodDurationDays.value);
  const to = subDays(props.modelValue.from, 1);
  updatePeriod({ from, to });
};

const selectNextPeriod = () => {
  const from = addDays(props.modelValue.to, 1);
  const to = addDays(props.modelValue.to, periodDurationDays.value);
  updatePeriod({ from, to });
};

const handleDateRangeSelect = (range: DateRange) => {
  if (range.start && range.end) {
    updatePeriod({
      from: calendarDateToDate(range.start),
      to: calendarDateToDate(range.end),
    });
    isCalendarOpen.value = false;
  }
};

const applyPreset = (preset: PeriodPreset) => {
  updatePeriod(preset.getValue());
  isCalendarOpen.value = false;
};

const isPresetActive = (preset: PeriodPreset): boolean => {
  const presetValue = preset.getValue();
  return (
    props.modelValue.from.getTime() === presetValue.from.getTime() &&
    props.modelValue.to.getTime() === presetValue.to.getTime()
  );
};
</script>
