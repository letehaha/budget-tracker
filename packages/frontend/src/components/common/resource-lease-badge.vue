<template>
  <ResponsiveTooltip v-if="state !== 'inactive'" content-class-name="max-w-72">
    <span :class="pillClass">
      <span v-if="state === 'active'" class="bg-success-text size-1.5 shrink-0 animate-pulse rounded-full" />
      <ClockIcon v-else-if="state === 'counting-down'" class="size-3 shrink-0" />
      <AlertTriangleIcon v-else class="size-3 shrink-0" />

      <span class="tabular-nums">{{ label }}</span>

      <!-- Only this sentence is live: a live region around the clock would make
           assistive tech re-announce the badge once per second. -->
      <span class="sr-only" role="status">{{ announcement }}</span>
    </span>

    <template #content>
      {{ tooltip }}
    </template>
  </ResponsiveTooltip>
</template>

<script setup lang="ts">
import { getCoarseDuration } from '@/common/utils/duration';
import ResponsiveTooltip from '@/components/common/responsive-tooltip.vue';
import type { ResourceLeaseState } from '@/composable/use-resource-lease';
import { cn } from '@/lib/utils';
import { AlertTriangleIcon, ClockIcon } from '@lucide/vue';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

const props = withDefaults(
  defineProps<{
    state: ResourceLeaseState;
    /** Countdown clock for `counting-down`, already formatted as `m:ss`. */
    formattedRemaining: string;
    msRemaining: number;
    /** When true, working on is no longer enough to keep the resource alive. */
    isCapped?: boolean;
    /** Already-translated noun for the leased thing, e.g. "Your uploaded file". */
    resourceLabel?: string;
  }>(),
  { isCapped: false, resourceLabel: undefined },
);

const { t } = useI18n();

const resource = computed(() => props.resourceLabel ?? t('common.resourceLease.defaultResourceLabel'));

const WARNING_THRESHOLD_MS = 5 * 60 * 1000;
const URGENT_THRESHOLD_MS = 60 * 1000;

const BASE_PILL_CLASS = 'inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium';

const isUrgent = computed(() => props.state === 'counting-down' && props.msRemaining <= URGENT_THRESHOLD_MS);
const isWarning = computed(
  () => props.state === 'counting-down' && !isUrgent.value && props.msRemaining <= WARNING_THRESHOLD_MS,
);

const pillClass = computed(() =>
  cn(BASE_PILL_CLASS, {
    'bg-success/20 text-success-text': props.state === 'active',
    'bg-muted text-muted-foreground': props.state === 'counting-down' && !isWarning.value && !isUrgent.value,
    'bg-warning/20 text-warning-text': isWarning.value,
    'bg-destructive/20 text-destructive-text': isUrgent.value || props.state === 'expired',
  }),
);

const label = computed(() => {
  switch (props.state) {
    case 'active':
      return t('common.resourceLease.activeLabel');
    case 'counting-down':
      return props.formattedRemaining;
    case 'expired':
      return t('common.resourceLease.expiredLabel');
    default:
      return '';
  }
});

/** Coarse prose ("about 12 minutes") — a live number here would jitter on every refresh. */
const coarseRemaining = computed(() => {
  const { unit, value } = getCoarseDuration({ ms: props.msRemaining });
  return t(`common.resourceLease.duration.${unit}`, { count: value }, value);
});

const tooltip = computed(() => {
  switch (props.state) {
    case 'active':
      return t('common.resourceLease.activeTooltip', { resource: resource.value, duration: coarseRemaining.value });
    case 'counting-down':
      return props.isCapped
        ? t('common.resourceLease.cappedTooltip', { resource: resource.value, time: props.formattedRemaining })
        : t('common.resourceLease.countingDownTooltip', { resource: resource.value, time: props.formattedRemaining });
    case 'expired':
      return t('common.resourceLease.expiredTooltip', { resource: resource.value });
    default:
      return '';
  }
});

const announcement = computed(() => {
  switch (props.state) {
    case 'active':
      return t('common.resourceLease.status.active', { resource: resource.value });
    case 'counting-down':
      return t('common.resourceLease.status.countingDown', { resource: resource.value });
    case 'expired':
      return t('common.resourceLease.status.expired', { resource: resource.value });
    default:
      return '';
  }
});
</script>
