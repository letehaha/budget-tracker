<template>
  <div class="flex flex-col gap-2">
    <div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm">
      <div class="font-semibold">{{ $t('analytics.fire.progress.progressTo', { type: targetName }) }}</div>
      <div class="text-muted-foreground tabular-nums">
        <span :class="cn('font-bold', isReached ? 'text-success-text' : 'text-foreground')">{{ pctLabel }}</span>
        <template v-if="plan.target !== null">
          ·
          {{
            $t('analytics.fire.progress.amountOfTarget', {
              balance: formatCompact({ amount: plan.inputs.balance }),
              target: formatCompact({ amount: plan.target }),
            })
          }}
        </template>
      </div>
    </div>

    <div
      role="progressbar"
      :aria-valuenow="pct"
      aria-valuemin="0"
      :aria-valuemax="isReached ? pct : 100"
      :aria-label="$t('analytics.fire.progress.progressTo', { type: targetName })"
      class="relative h-3.5"
    >
      <div class="bg-muted absolute inset-0 rounded-full" />
      <div
        :class="cn('absolute inset-y-0 left-0 rounded-full', barColorClass)"
        :style="{ width: `${Math.min(100, pct)}%` }"
      />
      <div
        v-for="tick in ticks"
        :key="tick.pct"
        :class="cn('absolute -top-0.75 h-5 w-0.5 rounded-xs', tick.reached ? 'bg-success-text' : 'bg-border')"
        :style="{ left: `${tick.pct}%` }"
      />
    </div>

    <div class="text-muted-foreground flex flex-wrap justify-between gap-x-3 gap-y-1 text-xs tabular-nums">
      <div>
        <template v-if="next === null">{{ $t('analytics.fire.progress.targetReached') }}</template>
        <i18n-t
          v-else-if="next.hitMonth !== null && next.date !== null"
          keypath="analytics.fire.progress.next"
          tag="span"
        >
          <template #goal>
            <span class="text-foreground font-semibold">
              {{
                $t('analytics.fire.progress.nextGoal', {
                  goal: nextLabel,
                  duration: formatDuration({ months: next.hitMonth, t }),
                })
              }}
            </span>
          </template>
          <template #date>{{ format(next.date, 'LLL yyyy') }}</template>
        </i18n-t>
        <template v-else>
          {{ $t('analytics.fire.progress.nextUnreachable', { goal: nextLabel }) }}
        </template>
      </div>
      <i18n-t keypath="analytics.fire.progress.supportsToday" tag="div">
        <template #amount>
          <span class="text-foreground font-semibold">{{ formatWholeBaseCurrency(plan.inputs.monthlyIncome) }}</span>
        </template>
      </i18n-t>
    </div>

    <Callout v-if="plan.inputs.balance < 0" variant="info" class="mt-1">
      {{ $t('analytics.fire.progress.negativeNetWorth') }}
    </Callout>
  </div>
</template>

<script setup lang="ts">
import { Callout } from '@/components/lib/ui/callout';
import { useFormatCurrency } from '@/composable';
import type { FirePlan } from '@/composable/fire/build-fire-plan';
import { useDateLocale } from '@/composable/use-date-locale';
import { formatDuration } from '@/js/helpers/format-duration';
import { cn } from '@/lib/utils';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

import {
  displayProgressPct,
  formatProgressPct,
  milestoneLabel,
  useFormatFireCompact,
} from '@/composable/fire/fire-display';

const props = defineProps<{ plan: FirePlan; targetName: string }>();

const { t } = useI18n();
const { format } = useDateLocale();
const { formatWholeBaseCurrency } = useFormatCurrency();
const formatCompact = useFormatFireCompact();

const isReached = computed(() => props.plan.status === 'reached');
const pct = computed(() => displayProgressPct({ ratio: props.plan.progress ?? 0, reached: isReached.value }));
const pctLabel = computed(() => formatProgressPct({ ratio: props.plan.progress ?? 0, reached: isReached.value }));
const ticks = computed(() => props.plan.milestones.filter((m) => m.pct < 100));
const next = computed(() => props.plan.nextMilestone);
const nextLabel = computed(() =>
  next.value === null ? '' : milestoneLabel({ pct: next.value.pct, targetName: props.targetName }),
);
const barColorClass = computed(() => {
  if (isReached.value) return 'bg-success-text';
  if (props.plan.status === 'unreachable') return 'bg-warning';
  return 'bg-primary';
});
</script>
