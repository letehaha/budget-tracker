<template>
  <section class="flex min-h-full flex-col p-6">
    <!-- Main period selector - floating on mobile, normal flow on desktop -->
    <div
      v-if="!hasNoAccounts"
      :class="
        cn([
          'bg-background/95 supports-[backdrop-filter]:bg-background/80 z-(--z-navbar) order-last -mx-6 mt-auto border-t py-2 backdrop-blur',
          // 'sticky max-md:bottom-[var(--bottom-navbar-height)] md:top-[var(--header-height)]',
          // 'max-md:right-0 max-md:bottom-[calc(var(--bottom-navbar-height)+env(safe-area-inset-bottom)-1px)] max-md:left-0',
          'max-md:right-0 max-md:left-0',
          'sticky md:top-[var(--header-height)]',
          isSafariMobile
            ? isPWA
              ? 'max-md:bottom-[calc(var(--bottom-navbar-height)-env(safe-area-inset-bottom)-1px)]'
              : 'max-md:bottom-[calc(var(--bottom-navbar-height-content-rect)-env(safe-area-inset-bottom)-1px)]'
            : 'max-md:bottom-[calc(env(safe-area-inset-bottom)-1px)]',
          'md:order-first md:mx-0 md:mt-0 md:mb-6 md:border-t-0 md:py-0',
        ])
      "
    >
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

        <ui-button size="icon" variant="ghost" :disabled="isCurrentPeriodSameMonth" @click="selectNextPeriod">
          <ChevronRight :size="20" />
        </ui-button>
      </div>
    </div>

    <template v-if="hasNoAccounts">
      <DashboardOnboarding />
    </template>
    <template v-else>
      <div
        :class="[
          `grid gap-6 max-md:pb-4`,
          `xl:grid-cols-[minmax(0,1fr)_420px] xl:[grid-template-areas:'balance-trend_latest-records'_'spending-categories_latest-records']`,
          `md:grid-cols-2 md:[grid-template-areas:'balance-trend_balance-trend'_'spending-categories_latest-records']`,
          `grid-cols-1 [grid-template-areas:'balance-trend'_'spending-categories'_'latest-records']`,
        ]"
      >
        <BalanceTrendWidget :selected-period="currentPeriod" class="[grid-area:balance-trend]" />

        <SpendingCategoriesWidget :selected-period="currentPeriod" class="[grid-area:spending-categories]" />

        <LatestRecordsWidget class="[grid-area:latest-records] lg:max-w-[420px]" />
      </div>
    </template>
  </section>
</template>

<script lang="ts" setup>
import UiButton from '@/components/lib/ui/button/Button.vue';
import Popover from '@/components/lib/ui/popover/Popover.vue';
import PopoverContent from '@/components/lib/ui/popover/PopoverContent.vue';
import PopoverTrigger from '@/components/lib/ui/popover/PopoverTrigger.vue';
import RangeCalendar from '@/components/lib/ui/range-calendar/RangeCalendar.vue';
import DashboardOnboarding from '@/components/widgets/dashboard-onboarding.vue';
import { useSafariDetection } from '@/composable/detect-safari';
import { cn } from '@/lib/utils';
import { useAccountsStore } from '@/stores';
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
import { storeToRefs } from 'pinia';
import { type DateRange } from 'reka-ui';
import { computed, defineAsyncComponent, ref } from 'vue';

const BalanceTrendWidget = defineAsyncComponent(() => import('@/components/widgets/balance-trend.vue'));
const LatestRecordsWidget = defineAsyncComponent(() => import('@/components/widgets/latest-records.vue'));
const SpendingCategoriesWidget = defineAsyncComponent(() => import('@/components/widgets/expenses-structure.vue'));

const { isSafariMobile, isPWA } = useSafariDetection();

const accountsStore = useAccountsStore();
const { accounts, isAccountsFetched } = storeToRefs(accountsStore);
const hasNoAccounts = computed(() => isAccountsFetched.value && accounts.value.length === 0);

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

const isCalendarOpen = ref(false);

const currentPeriod = ref({
  from: startOfMonth(new Date()),
  to: endOfMonth(new Date()),
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

// Calculate period duration to shift by the same amount
const periodDurationDays = computed(() => differenceInDays(currentPeriod.value.to, currentPeriod.value.from) + 1);

const selectPrevPeriod = () => {
  const from = subDays(currentPeriod.value.from, periodDurationDays.value);
  const to = subDays(currentPeriod.value.from, 1); // End right before current period starts
  currentPeriod.value = { from, to };
};

const selectNextPeriod = () => {
  const from = addDays(currentPeriod.value.to, 1); // Start right after current period ends
  const to = addDays(currentPeriod.value.to, periodDurationDays.value);
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
