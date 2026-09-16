<template>
  <div class="border-border bg-card rounded-lg border p-4">
    <div class="mb-1 flex flex-wrap items-center gap-1.5">
      <span class="text-muted-foreground text-sm whitespace-nowrap">{{ title }}</span>
      <SummaryChangeBadge
        v-if="change !== undefined"
        :change="change"
        :invert-colors="invertColors"
        :comparison-period-label="comparisonPeriodLabel"
      />
    </div>
    <div class="text-lg font-semibold sm:text-2xl">
      {{ formattedValue }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { useFormatCurrency } from '@/composable';
import { computed } from 'vue';

import SummaryChangeBadge from './summary-change-badge.vue';

const props = defineProps<{
  title: string;
  value: number;
  change?: number;
  suffix?: string;
  comparisonPeriodLabel?: string;
  /** When true, positive change is bad (red) and negative is good (green). Use for expenses. */
  invertColors?: boolean;
  /** Literal text shown in place of the formatted value, e.g. "—" when the metric is undefined for the range. */
  valueLabel?: string;
}>();

const { formatBaseCurrency } = useFormatCurrency();

const formattedValue = computed(() => {
  if (props.valueLabel !== undefined) {
    return props.valueLabel;
  }
  if (props.suffix) {
    return `${props.value}${props.suffix}`;
  }
  return formatBaseCurrency(props.value);
});
</script>
