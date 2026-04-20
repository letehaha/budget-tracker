<script setup lang="ts">
import { Button } from '@/components/lib/ui/button';
import { Checkbox } from '@/components/lib/ui/checkbox';
import { DateSelector, type DateSelectorPreset } from '@/components/lib/ui/date-selector';
import { useEarliestTransactionDate } from '@/composable/data-queries/earliest-transaction-date';
import type { Period } from '@/composable/use-period-navigation';
import { endOfMonth, endOfYear, startOfMonth, startOfYear, subMonths, subYears } from 'date-fns';
import { CalendarIcon, LoaderCircleIcon, SearchIcon } from 'lucide-vue-next';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

defineProps<{
  isLoading: boolean;
}>();

const period = defineModel<Period>('period', { required: true });
const includeOutOfWallet = defineModel<boolean>('includeOutOfWallet', { required: true });

defineEmits<{
  scan: [];
}>();

const { earliestDate } = useEarliestTransactionDate();

const quickPresets = computed<DateSelectorPreset[]>(() => [
  {
    label: t('optimizations.transferSuggestions.presets.last3Months'),
    getValue: () => ({
      from: startOfMonth(subMonths(new Date(), 2)),
      to: endOfMonth(new Date()),
    }),
  },
  {
    label: t('optimizations.transferSuggestions.presets.last6Months'),
    getValue: () => ({
      from: startOfMonth(subMonths(new Date(), 5)),
      to: endOfMonth(new Date()),
    }),
  },
  {
    label: t('optimizations.transferSuggestions.presets.lastYear'),
    getValue: () => ({
      from: startOfMonth(subMonths(new Date(), 11)),
      to: endOfMonth(new Date()),
    }),
  },
  {
    label: t('optimizations.transferSuggestions.presets.thisYear'),
    getValue: () => ({
      from: startOfYear(new Date()),
      to: new Date(),
    }),
  },
  {
    label: t('optimizations.transferSuggestions.presets.previousYear'),
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

<template>
  <div class="flex flex-wrap items-center gap-3">
    <DateSelector
      v-model="period"
      :presets="quickPresets"
      :earliest-date="earliestDate"
      popover-class-name="md:min-w-[600px]"
    >
      <template #trigger="{ triggerText }">
        <Button variant="outline" size="sm" class="min-w-48 font-medium">
          <CalendarIcon class="mr-1.5 size-3.5" />
          {{ triggerText }}
        </Button>
      </template>
    </DateSelector>

    <label class="flex cursor-pointer items-center gap-2">
      <Checkbox v-model="includeOutOfWallet" />
      <span class="text-sm">{{ $t('optimizations.transferSuggestions.includeOutOfWallet') }}</span>
    </label>

    <Button :disabled="isLoading" class="gap-2" @click="$emit('scan')">
      <LoaderCircleIcon v-if="isLoading" class="size-4 animate-spin" />
      <SearchIcon v-else class="size-4" />
      {{ $t('common.actions.scan') }}
    </Button>
  </div>
</template>
