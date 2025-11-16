<template>
  <section class="p-6">
    <div class="mb-6">
      <!-- Main period selector -->
      <div class="flex items-center justify-center gap-1">
        <ui-button size="icon" variant="ghost" @click="selectPrevPeriod">
          <ChevronLeft :size="20" />
        </ui-button>

        <Popover v-model:open="isCalendarOpen">
          <PopoverTrigger as-child>
            <ui-button variant="ghost" class="hover:bg-accent min-w-[150px] font-normal">
              <CalendarIcon class="mr-2 size-4" />
              {{ periodSelectorText }}
            </ui-button>
          </PopoverTrigger>
          <PopoverContent class="w-auto p-4" align="center">
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

        <ui-button size="icon" variant="ghost" :disabled="isCurrentPeriodSameMonth" @click="selectNextPeriod">
          <ChevronRight :size="20" />
        </ui-button>
      </div>
    </div>

    <div
      :class="[
        `grid gap-6`,
        `xl:grid-cols-[minmax(0,1fr)_420px] xl:[grid-template-areas:'balance-trend_latest-records'_'spending-categories_latest-records']`,
        `md:grid-cols-2 md:[grid-template-areas:'balance-trend_balance-trend'_'spending-categories_latest-records']`,
        `grid-cols-1 [grid-template-areas:'balance-trend'_'spending-categories'_'latest-records']`,
      ]"
    >
      <BalanceTrendWidget :selected-period="currentPeriod" class="[grid-area:balance-trend]" />

      <SpendingCategoriesWidget :selected-period="currentPeriod" class="[grid-area:spending-categories]" />

      <LatestRecordsWidget class="[grid-area:latest-records] lg:max-w-[420px]" />
    </div>
  </section>
</template>

<script lang="ts" setup>
import UiButton from '@/components/lib/ui/button/Button.vue';
import Popover from '@/components/lib/ui/popover/Popover.vue';
import PopoverContent from '@/components/lib/ui/popover/PopoverContent.vue';
import PopoverTrigger from '@/components/lib/ui/popover/PopoverTrigger.vue';
import RangeCalendar from '@/components/lib/ui/range-calendar/RangeCalendar.vue';
import { CalendarDate, type DateValue } from '@internationalized/date';
import {
  addMonths,
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
import { type DateRange } from 'radix-vue';
import { computed, defineAsyncComponent, ref } from 'vue';

const BalanceTrendWidget = defineAsyncComponent(() => import('@/components/widgets/balance-trend.vue'));
const LatestRecordsWidget = defineAsyncComponent(() => import('@/components/widgets/latest-records.vue'));
const SpendingCategoriesWidget = defineAsyncComponent(() => import('@/components/widgets/expenses-structure.vue'));

defineOptions({
  name: 'page-dashboard',
});

interface PeriodPreset {
  label: string;
  getValue: () => { from: Date; to: Date };
}

// Helper functions to convert between Date and DateValue
const dateToCalendarDate = (date: Date): CalendarDate => {
  return new CalendarDate(date.getFullYear(), date.getMonth() + 1, date.getDate());
};

const calendarDateToDate = (calendarDate: DateValue): Date => {
  return new Date(calendarDate.year, calendarDate.month - 1, calendarDate.day);
};

const currentDayInMonth = new Date().getDate();
const isCalendarOpen = ref(false);

const currentPeriod = ref({
  from: subDays(new Date(), currentDayInMonth - 1),
  to: new Date(),
});

// Calendar value for the RangeCalendar component
const calendarValue = computed(() => ({
  start: dateToCalendarDate(currentPeriod.value.from),
  end: dateToCalendarDate(currentPeriod.value.to),
}));

// Quick preset buttons
const quickPresets = ref<PeriodPreset[]>([
  {
    label: 'Current Month',
    getValue: () => ({
      from: startOfMonth(new Date()),
      to: new Date(),
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
]);

const isCurrentPeriodSameMonth = computed(() => isSameMonth(new Date(), currentPeriod.value.to));

const periodSelectorText = computed(() => {
  const from = currentPeriod.value.from;
  const to = currentPeriod.value.to;

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

const selectPrevPeriod = () => {
  const from = startOfMonth(subMonths(currentPeriod.value.from, 1));
  const to = endOfMonth(subMonths(currentPeriod.value.to, 1));
  currentPeriod.value = { from, to };
};

const selectNextPeriod = () => {
  const from = startOfMonth(addMonths(currentPeriod.value.from, 1));
  let to = endOfMonth(addMonths(currentPeriod.value.to, 1));

  if (isSameMonth(new Date(), to)) to = new Date();

  currentPeriod.value = { from, to };
};

const handleDateRangeSelect = (range: DateRange) => {
  if (range.start && range.end) {
    currentPeriod.value = {
      from: calendarDateToDate(range.start),
      to: calendarDateToDate(range.end),
    };
    isCalendarOpen.value = false;
  }
};

const applyPreset = (preset: PeriodPreset) => {
  currentPeriod.value = preset.getValue();
  isCalendarOpen.value = false;
};

const isPresetActive = (preset: PeriodPreset): boolean => {
  const presetValue = preset.getValue();
  return (
    currentPeriod.value.from.getTime() === presetValue.from.getTime() &&
    currentPeriod.value.to.getTime() === presetValue.to.getTime()
  );
};
</script>
