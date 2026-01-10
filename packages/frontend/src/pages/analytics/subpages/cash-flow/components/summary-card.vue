<template>
  <div class="border-border bg-card rounded-lg border p-4">
    <div class="mb-1 flex flex-wrap items-center gap-1.5">
      <span class="text-muted-foreground text-sm whitespace-nowrap">{{ title }}</span>
      <Tooltip.TooltipProvider v-if="change !== undefined">
        <Tooltip.Tooltip :delay-duration="0">
          <Tooltip.TooltipTrigger as-child>
            <span :class="changeInfo.class" class="cursor-help text-xs font-medium">
              <component :is="changeInfo.icon" class="inline size-3" />
              {{ Math.abs(change) }}%
            </span>
          </Tooltip.TooltipTrigger>
          <Tooltip.TooltipContent>
            {{ comparisonPeriodLabel || t('analytics.cashFlow.vsPreviousPeriod') }}
          </Tooltip.TooltipContent>
        </Tooltip.Tooltip>
      </Tooltip.TooltipProvider>
    </div>
    <div class="text-2xl font-semibold">
      {{ formattedValue }}
    </div>
  </div>
</template>

<script setup lang="ts">
import * as Tooltip from '@/components/lib/ui/tooltip';
import { useFormatCurrency } from '@/composable';
import { ArrowDownIcon, ArrowUpIcon, MinusIcon } from 'lucide-vue-next';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const props = defineProps<{
  title: string;
  value: number;
  change?: number;
  suffix?: string;
  comparisonPeriodLabel?: string;
}>();

const { formatBaseCurrency } = useFormatCurrency();

const formattedValue = computed(() => {
  if (props.suffix) {
    return `${props.value}${props.suffix}`;
  }
  return formatBaseCurrency(props.value);
});

const changeInfo = computed(() => {
  if (props.change === undefined || props.change === 0) {
    return { class: 'text-muted-foreground', icon: MinusIcon };
  }
  return props.change > 0
    ? { class: 'text-green-500', icon: ArrowUpIcon }
    : { class: 'text-red-500', icon: ArrowDownIcon };
});
</script>
