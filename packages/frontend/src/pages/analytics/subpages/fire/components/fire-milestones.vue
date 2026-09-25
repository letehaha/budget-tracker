<template>
  <div class="@container/milestones">
    <ol class="grid grid-cols-1 gap-2.5 @md/milestones:grid-cols-2 @3xl/milestones:grid-cols-4">
      <li v-for="(milestone, index) in milestones" :key="milestone.pct" class="flex items-center gap-2 text-xs">
        <span
          :class="
            cn(
              'flex size-5.5 shrink-0 items-center justify-center rounded-full',
              milestone.reached ? 'bg-success-text text-card' : 'border-2',
              !milestone.reached && (index === nextIndex ? 'border-primary' : 'border-border'),
            )
          "
        >
          <CheckIcon v-if="milestone.reached" class="size-3" />
          <FlameIcon v-else-if="milestone.pct === 100" class="text-primary-text size-3" />
        </span>
        <span class="tabular-nums">
          <span class="font-bold">
            {{ milestoneLabel({ pct: milestone.pct, targetName }) }}
          </span>
          <span class="text-muted-foreground"> · {{ describe({ milestone }) }}</span>
        </span>
      </li>
    </ol>
  </div>
</template>

<script setup lang="ts">
import type { FireMilestone } from '@/composable/fire/build-fire-plan';
import { milestoneLabel } from '@/composable/fire/fire-display';
import { useDateLocale } from '@/composable/use-date-locale';
import { formatDuration } from '@/js/helpers/format-duration';
import { cn } from '@/lib/utils';
import { CheckIcon, FlameIcon } from '@lucide/vue';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

const props = defineProps<{ milestones: FireMilestone[]; targetName: string }>();

const { t } = useI18n();
const { format } = useDateLocale();

const nextIndex = computed(() => props.milestones.findIndex((m) => !m.reached));

const describe = ({ milestone }: { milestone: FireMilestone }) => {
  if (milestone.reached) return t('analytics.fire.milestones.reached');
  if (milestone.hitMonth === null || milestone.date === null) return t('analytics.fire.notWithinHorizon');
  return t('analytics.fire.milestones.eta', {
    duration: formatDuration({ months: milestone.hitMonth, t }),
    date: format(milestone.date, 'LLL yyyy'),
  });
};
</script>
