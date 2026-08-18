<template>
  <TooltipProvider v-if="marker" :delay-duration="0">
    <Tooltip>
      <TooltipTrigger as-child>
        <div
          :class="
            cn(
              'flex shrink-0 items-center justify-center',
              compact ? 'size-4' : 'size-6 gap-0.5 rounded-sm border px-1 py-0.5 text-xs',
              marker.className,
            )
          "
          :aria-label="marker.label"
        >
          <component :is="marker.icon" :class="compact ? 'size-3.5' : 'size-4'" />
        </div>
      </TooltipTrigger>
      <TooltipContent>{{ marker.tooltip }}</TooltipContent>
    </Tooltip>
  </TooltipProvider>
</template>

<script lang="ts" setup>
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/lib/ui/tooltip';
import { isPlanMatchWindowExpired, planExpiredDays } from '@/common/utils/planned-transactions';
import { useDateLocale } from '@/composable/use-date-locale';
import { cn } from '@/lib/utils';
import { TransactionModel } from '@bt/shared/types';
import { CalendarClockIcon, CalendarX2Icon, CircleCheckIcon } from '@lucide/vue';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();
const { format } = useDateLocale();

const props = withDefaults(
  defineProps<{
    transaction: TransactionModel;
    /** Icon-only rendering. */
    compact?: boolean;
    /** Drops the confirmation tick, keeping only markers that need attention. */
    hideConfirmed?: boolean;
  }>(),
  { compact: false, hideConfirmed: false },
);

const mergedAt = computed(() => props.transaction.plannedMerge?.mergedAt);

const marker = computed(() => {
  if (props.transaction.isPlanned) {
    const time = props.transaction.time;

    if (isPlanMatchWindowExpired({ time })) {
      return {
        icon: CalendarX2Icon,
        className: 'border-warning text-warning-text',
        label: t('transactions.planned.label'),
        tooltip: t('transactions.planned.expiredTooltip', {
          days: planExpiredDays({ time }),
        }),
      };
    }

    return {
      icon: CalendarClockIcon,
      className: 'border-primary text-primary-text',
      label: t('transactions.planned.label'),
      tooltip: t('transactions.planned.plannedTooltip'),
    };
  }

  if (mergedAt.value && !props.hideConfirmed) {
    return {
      icon: CircleCheckIcon,
      className: 'border-app-income-color/50 text-app-income-color',
      label: t('transactions.planned.confirmedLabel'),
      tooltip: t('transactions.planned.mergedTooltip', { date: format(new Date(mergedAt.value), 'd MMM y') }),
    };
  }

  return null;
});
</script>
