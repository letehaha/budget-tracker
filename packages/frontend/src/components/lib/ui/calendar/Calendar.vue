<script setup lang="ts">
import { buttonVariants } from '@/components/lib/ui/button';
import { cn } from '@/lib/utils';
import { useVModel } from '@vueuse/core';
import { ChevronLeft, ChevronRight } from 'lucide-vue-next';
import { DatePicker } from 'v-calendar';
import { computed, nextTick, onMounted, ref, useSlots } from 'vue';

import { isVCalendarSlot } from '../calendar';

/* Extracted from v-calendar */
interface SimpleDateParts {
  year: number;
  month: number;
  day: number;
  hours: number;
  minutes: number;
  seconds: number;
  milliseconds: number;
}
type DateSource = Date | string | number;
type DatePickerDate = DateSource | Partial<SimpleDateParts> | null;
interface DatePickerRangeObject {
  start: Exclude<DatePickerDate, null>;
  end: Exclude<DatePickerDate, null>;
}
type DatePickerModel = DatePickerDate | DatePickerRangeObject;

defineOptions({
  inheritAttrs: false,
});

const props = withDefaults(
  defineProps<{
    modelValue?: string | number | Date | DatePickerModel;
    modelModifiers?: object;
    columns?: number;
    type?: 'single' | 'range';
  }>(),
  {
    type: 'single',
    columns: 1,
    modelValue: undefined,
    modelModifiers: undefined,
  },
);
const emits = defineEmits<{
  (e: 'update:modelValue', payload: typeof props.modelValue): void;
}>();

const modelValue = useVModel(props, 'modelValue', emits, {
  passive: true,
});

const datePicker = ref<InstanceType<typeof DatePicker>>();
// In this current version of v-calendar has the calendarRef instance, which is
// required to handle arrow nav.
const calendarRef = computed(() => datePicker.value.calendarRef);

function handleNav(direction: 'prev' | 'next') {
  if (!calendarRef.value) return;

  if (direction === 'prev') calendarRef.value.movePrev();
  else calendarRef.value.moveNext();
}

onMounted(async () => {
  await nextTick();
  if (modelValue.value instanceof Date && calendarRef.value) calendarRef.value.focusDate(modelValue.value);
});

const $slots = useSlots();
const vCalendarSlots = computed(() =>
  Object.keys($slots)
    .filter((name) => isVCalendarSlot(name))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .reduce((obj: Record<string, any>, key: string) => {
      // eslint-disable-next-line no-param-reassign
      obj[key] = $slots[key];
      return obj;
    }, {}),
);
</script>

<template>
  <div class="relative">
    <div v-if="$attrs.mode !== 'time'" class="absolute top-3 z-[1] flex w-full justify-between px-4">
      <button
        type="button"
        :class="cn(buttonVariants({ variant: 'outline' }), 'h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100')"
        @click="handleNav('prev')"
      >
        <ChevronLeft class="h-4 w-4" />
      </button>
      <button
        type="button"
        :class="cn(buttonVariants({ variant: 'outline' }), 'h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100')"
        @click="handleNav('next')"
      >
        <ChevronRight class="h-4 w-4" />
      </button>
    </div>

    <DatePicker
      ref="datePicker"
      v-model="modelValue"
      v-bind="$attrs"
      :model-modifiers="modelModifiers"
      class="calendar"
      trim-weeks
      :transition="'none'"
      :columns="columns"
    >
      <template v-for="(_, slot) of vCalendarSlots" #[slot]="scope">
        <slot :name="slot" v-bind="scope" />
      </template>
    </DatePicker>
  </div>
</template>

<style lang="scss">
.calendar {
  @apply p-3 text-center;
}
.calendar .vc-pane-layout {
  @apply grid gap-4;
}
.calendar .vc-title {
  @apply pointer-events-none text-sm font-medium;
}
.calendar .vc-pane-header-wrapper {
  @apply hidden;
}
.calendar .vc-weeks {
  @apply mt-4;
}
.calendar .vc-weekdays {
  @apply flex;
}
.calendar .vc-weekday {
  @apply text-muted-foreground w-9 rounded-md text-[0.8rem] font-normal;
}
.calendar .vc-weeks {
  @apply flex w-full flex-col space-y-2 [&>_div]:grid [&>_div]:grid-cols-7;
}
.calendar .vc-day:has(.vc-highlights) {
  @apply bg-accent overflow-hidden first:rounded-l-md last:rounded-r-md;
}
.calendar .vc-day.is-today:not(:has(.vc-day-layer)) {
  @apply bg-secondary rounded-md;
}
.calendar .vc-day:has(.vc-highlight-base-start) {
  @apply rounded-l-md;
}
.calendar .vc-day:has(.vc-highlight-base-end) {
  @apply rounded-r-md;
}
.calendar .vc-day:has(.vc-highlight-bg-outline):not(:has(.vc-highlight-base-start)):not(:has(.vc-highlight-base-end)) {
  @apply rounded-md;
}
.calendar .vc-day-content {
  @apply ring-offset-background hover:bg-accent hover:text-accent-foreground focus-visible:ring-ring relative inline-flex h-9 w-9 select-none items-center justify-center p-0 text-center text-sm font-normal focus-within:relative focus-within:z-20 hover:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 aria-selected:opacity-100;
}
.calendar .vc-day-content:not(.vc-highlight-content-light) {
  @apply rounded-md;
}
.calendar .vc-day-content.vc-disabled {
  @apply cursor-not-allowed;
}
.calendar .vc-day-content.vc-disabled:hover {
  // prevent hover state for disabled item
  @apply text-muted-foreground bg-transparent opacity-50;
}
.calendar
  .is-not-in-month:not(:has(.vc-highlight-content-solid)):not(:has(.vc-highlight-content-light)):not(
    :has(.vc-highlight-content-outline)
  ),
.calendar .vc-disabled {
  @apply text-muted-foreground opacity-50;
}
.calendar .vc-highlight-content-solid,
.calendar .vc-highlight-content-outline {
  @apply bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground;
}
.calendar .vc-highlight-content-light {
  @apply bg-accent text-accent-foreground;
}
.calendar .vc-pane-container.in-transition {
  @apply overflow-hidden;
}
.calendar .vc-pane-container {
  @apply relative w-full;
}
:root {
  --vc-slide-translate: 22px;
  --vc-slide-duration: 0.15s;
  --vc-slide-timing: ease;
}
.calendar .vc-fade-enter-active,
.calendar .vc-fade-leave-active,
.calendar .vc-slide-left-enter-active,
.calendar .vc-slide-left-leave-active,
.calendar .vc-slide-right-enter-active,
.calendar .vc-slide-right-leave-active,
.calendar .vc-slide-up-enter-active,
.calendar .vc-slide-up-leave-active,
.calendar .vc-slide-down-enter-active,
.calendar .vc-slide-down-leave-active,
.calendar .vc-slide-fade-enter-active,
.calendar .vc-slide-fade-leave-active {
  transition:
    opacity var(--vc-slide-duration) var(--vc-slide-timing),
    -webkit-transform var(--vc-slide-duration) var(--vc-slide-timing);
  transition:
    transform var(--vc-slide-duration) var(--vc-slide-timing),
    opacity var(--vc-slide-duration) var(--vc-slide-timing);
  transition:
    transform var(--vc-slide-duration) var(--vc-slide-timing),
    opacity var(--vc-slide-duration) var(--vc-slide-timing),
    -webkit-transform var(--vc-slide-duration) var(--vc-slide-timing);
  -webkit-backface-visibility: hidden;
  backface-visibility: hidden;
  pointer-events: none;
}
.calendar .vc-none-leave-active,
.calendar .vc-fade-leave-active,
.calendar .vc-slide-left-leave-active,
.calendar .vc-slide-right-leave-active,
.calendar .vc-slide-up-leave-active,
.calendar .vc-slide-down-leave-active {
  position: absolute !important;
  width: 100%;
}
.calendar .vc-none-enter-from,
.calendar .vc-none-leave-to,
.calendar .vc-fade-enter-from,
.calendar .vc-fade-leave-to,
.calendar .vc-slide-left-enter-from,
.calendar .vc-slide-left-leave-to,
.calendar .vc-slide-right-enter-from,
.calendar .vc-slide-right-leave-to,
.calendar .vc-slide-up-enter-from,
.calendar .vc-slide-up-leave-to,
.calendar .vc-slide-down-enter-from,
.calendar .vc-slide-down-leave-to,
.calendar .vc-slide-fade-enter-from,
.calendar .vc-slide-fade-leave-to {
  opacity: 0;
}
.calendar .vc-slide-left-enter-from,
.calendar .vc-slide-right-leave-to,
.calendar .vc-slide-fade-enter-from.direction-left,
.calendar .vc-slide-fade-leave-to.direction-left {
  -webkit-transform: translateX(var(--vc-slide-translate));
  transform: translateX(var(--vc-slide-translate));
}
.calendar .vc-slide-right-enter-from,
.calendar .vc-slide-left-leave-to,
.calendar .vc-slide-fade-enter-from.direction-right,
.calendar .vc-slide-fade-leave-to.direction-right {
  -webkit-transform: translateX(calc(-1 * var(--vc-slide-translate)));
  transform: translateX(calc(-1 * var(--vc-slide-translate)));
}
.calendar .vc-slide-up-enter-from,
.calendar .vc-slide-down-leave-to,
.calendar .vc-slide-fade-enter-from.direction-top,
.calendar .vc-slide-fade-leave-to.direction-top {
  -webkit-transform: translateY(var(--vc-slide-translate));
  transform: translateY(var(--vc-slide-translate));
}
.calendar .vc-slide-down-enter-from,
.calendar .vc-slide-up-leave-to,
.calendar .vc-slide-fade-enter-from.direction-bottom,
.calendar .vc-slide-fade-leave-to.direction-bottom {
  -webkit-transform: translateY(calc(-1 * var(--vc-slide-translate)));
  transform: translateY(calc(-1 * var(--vc-slide-translate)));
}
/**
 * Timepicker styles
 */
.vc-time-picker {
  @apply flex flex-col items-center p-2;
}
.vc-time-picker.vc-invalid {
  @apply pointer-events-none opacity-50;
}
.vc-time-picker.vc-attached {
  @apply border-secondary mt-2 border-t border-solid;
}
.vc-time-picker > * + * {
  @apply mt-1;
}
.vc-time-header {
  @apply mt-1 flex items-center px-1 text-sm font-semibold uppercase leading-6;
}
.vc-time-select-group {
  @apply border-secondary bg-background inline-flex items-center rounded-md border border-solid px-1;
}
.vc-time-select-group .vc-base-icon {
  @apply stroke-primary text-primary mr-1;
}
.vc-time-select-group select {
  @apply bg-background appearance-none p-1 text-center outline-none;
}
.vc-time-weekday {
  @apply text-muted-foreground tracking-wide;
}
.vc-time-month {
  @apply text-primary ml-2;
}
.vc-time-day {
  @apply text-primary ml-1;
}
.vc-time-year {
  @apply text-muted-foreground ml-2;
}
.vc-time-colon {
  @apply mb-0.5;
}
.vc-time-decimal {
  @apply ml-0.5;
}
</style>
