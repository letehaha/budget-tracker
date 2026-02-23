<template>
  <div class="flex items-center justify-center gap-0.5">
    <Button size="icon-sm" variant="ghost" @click="selectPrevPeriod">
      <ChevronLeft :size="16" />
    </Button>

    <DateSelector v-model="period" :presets="quickPresets" popover-class-name="md:min-w-[600px]">
      <template #trigger="{ triggerText }">
        <Button variant="ghost" size="sm" class="hover:bg-accent min-w-55 font-medium">
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
import { type Period, usePeriodNavigation } from '@/composable/use-period-navigation';
import { endOfMonth, endOfYear, isAfter, startOfMonth, startOfYear, subMonths, subYears } from 'date-fns';
import { CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-vue-next';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

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

const { prevPeriod, nextPeriod } = usePeriodNavigation({
  period: () => props.modelValue,
});

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
]);
</script>
