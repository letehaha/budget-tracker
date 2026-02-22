<script lang="ts" setup>
import { CalendarDate, type DateValue } from '@internationalized/date';
import { type DateRange } from 'reka-ui';
import { computed } from 'vue';

import RangeCalendar from '../range-calendar/RangeCalendar.vue';

const props = withDefaults(
  defineProps<{
    start: Date | null;
    end: Date | null;
    numberOfMonths?: number;
    singleSelect?: boolean;
  }>(),
  {
    numberOfMonths: 2,
    singleSelect: false,
  },
);

const emit = defineEmits<{
  'update:range': [params: { start: Date; end: Date | null }];
}>();

function dateToCalendarDate(date: Date): CalendarDate {
  return new CalendarDate(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

function calendarDateToDate(calendarDate: DateValue): Date {
  return new Date(calendarDate.year, calendarDate.month - 1, calendarDate.day);
}

const calendarValue = computed(() => {
  if (!props.start) return undefined;
  return {
    start: dateToCalendarDate(props.start),
    end: props.end ? dateToCalendarDate(props.end) : dateToCalendarDate(props.start),
  };
});

function handleRangeSelect(range: DateRange) {
  if (props.singleSelect) {
    // In single mode, use start date from the range update
    if (range.start) {
      emit('update:range', {
        start: calendarDateToDate(range.start),
        end: null,
      });
    }
  } else if (range.start && range.end) {
    emit('update:range', {
      start: calendarDateToDate(range.start),
      end: calendarDateToDate(range.end),
    });
  }
}

function handleStartChange(date: DateValue | undefined) {
  if (props.singleSelect && date) {
    emit('update:range', {
      start: calendarDateToDate(date),
      end: null,
    });
  }
}
</script>

<template>
  <RangeCalendar
    :model-value="calendarValue"
    :number-of-months="numberOfMonths"
    @update:model-value="handleRangeSelect"
    @update:start-value="handleStartChange"
  />
</template>
