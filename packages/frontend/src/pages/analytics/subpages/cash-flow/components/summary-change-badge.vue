<template>
  <Tooltip.TooltipProvider>
    <Tooltip.Tooltip :delay-duration="0">
      <Tooltip.TooltipTrigger as-child>
        <span :class="changeInfo.class" class="cursor-help text-xs font-medium whitespace-nowrap">
          <component :is="changeInfo.icon" class="inline size-3" />
          {{ Math.abs(change) }}%
        </span>
      </Tooltip.TooltipTrigger>
      <Tooltip.TooltipContent>
        {{ comparisonPeriodLabel || t('analytics.cashFlow.vsPreviousPeriod') }}
      </Tooltip.TooltipContent>
    </Tooltip.Tooltip>
  </Tooltip.TooltipProvider>
</template>

<script setup lang="ts">
import * as Tooltip from '@/components/lib/ui/tooltip';
import { ArrowDownIcon, ArrowUpIcon, MinusIcon } from '@lucide/vue';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const props = defineProps<{
  change: number;
  comparisonPeriodLabel?: string;
  /** When true, positive change is bad (red) and negative is good (green). Use for expenses. */
  invertColors?: boolean;
}>();

const changeInfo = computed(() => {
  if (props.change === 0) {
    return { class: 'text-muted-foreground', icon: MinusIcon };
  }

  const isPositive = props.change > 0;
  const isGood = props.invertColors ? !isPositive : isPositive;

  return {
    class: isGood ? 'text-app-income-color' : 'text-app-expense-color',
    icon: isPositive ? ArrowUpIcon : ArrowDownIcon,
  };
});
</script>
