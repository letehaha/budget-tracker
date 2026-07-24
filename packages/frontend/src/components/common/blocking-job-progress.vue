<template>
  <!-- Hero: a slow ring spinning around a job badge signals live work. Frozen mid-spin
       the ring reads as a broken circle, so drop it entirely under reduced motion —
       the badge alone stays clean. The badge icon is job-specific (see `#icon`). -->
  <div class="relative mx-auto flex size-16 items-center justify-center">
    <Loader2Icon
      class="text-primary/30 animation-duration-[2.5s] absolute size-16 animate-spin motion-reduce:hidden"
      aria-hidden="true"
    />
    <div class="bg-primary/10 ring-primary/15 flex size-11 items-center justify-center rounded-full ring-1">
      <slot name="icon" />
    </div>
  </div>

  <!-- The ids are the accessibility contract read by blocking-job-overlay.vue's
       aria-labelledby / aria-describedby, so they stay fixed here. -->
  <h2 id="blocking-job-overlay-title" class="mt-5 text-lg font-semibold">
    <slot name="title" />
  </h2>

  <p id="blocking-job-overlay-description" class="text-muted-foreground mt-2 text-sm">
    <slot name="description" />
  </p>

  <!-- Progress: a determinate bar (solid = done, shimmering slice = in progress) plus
       the current step label and an optional trailing counter (see `#trailing`). -->
  <div class="mt-6">
    <div
      class="bg-primary/25 relative h-2 w-full overflow-hidden rounded-full"
      role="progressbar"
      :aria-valuemin="0"
      :aria-valuemax="totalSteps"
      :aria-valuenow="currentStepNumber ?? undefined"
      :aria-valuetext="counterText ?? undefined"
    >
      <div
        class="bg-primary absolute inset-y-0 left-0 transition-[width] duration-700 ease-out"
        :style="{ width: `${donePercent}%` }"
      />
      <div v-if="showSweep" class="bjp-sweep pointer-events-none absolute inset-0" aria-hidden="true" />
    </div>

    <div class="mt-3 flex items-center justify-between gap-3 text-sm">
      <span class="text-foreground flex min-w-0 items-center gap-2 font-medium">
        <CircleCheckIcon v-if="isFinishing" class="text-success-text size-4 shrink-0" aria-hidden="true" />
        <span v-else class="bg-primary size-1.5 shrink-0 animate-pulse rounded-full" aria-hidden="true" />
        <span class="truncate">{{ $t(currentLabelKey) }}</span>
      </span>

      <slot name="trailing" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { CircleCheckIcon, Loader2Icon } from '@lucide/vue';
import { computed } from 'vue';

/** The three states the bar renders: queued/no-step yet, a step in flight, and the
 *  brief completed window before the consumer wipes caches and reloads. */
type ProgressState = 'preparing' | 'running' | 'finishing';

const props = defineProps<{
  /** Job steps in backend execution order; its length is the "X of N" total. */
  orderedStepKeys: string[];
  /** Step key → i18n label key, for the running step's label. */
  stepLabelKeys: Record<string, string>;
  state: ProgressState;
  /** The running step's key; used to place the fill and number the step. */
  currentStepKey?: string | null;
  /** i18n keys for the two non-running labels. */
  preparingLabelKey: string;
  finishingLabelKey: string;
  /** Human "X of N" string; sets the progressbar's aria-valuetext when present. */
  counterText?: string | null;
}>();

const totalSteps = computed(() => props.orderedStepKeys.length);

const currentIndex = computed(() =>
  props.state === 'running' && props.currentStepKey ? props.orderedStepKeys.indexOf(props.currentStepKey) : -1,
);

const isFinishing = computed(() => props.state === 'finishing');

// The completed frame drops the sweep and just shows the full fill.
const showSweep = computed(() => props.state !== 'finishing');

// Steps before the current one are done, so the fill is index/total. `finishing`
// fills fully; `preparing` (and an unresolved step) leaves the track empty with only
// the sweep, reading as indeterminate work.
const donePercent = computed(() => {
  if (props.state === 'finishing') return 100;
  if (currentIndex.value >= 0) return (currentIndex.value / totalSteps.value) * 100;
  return 0;
});

const currentStepNumber = computed(() => (currentIndex.value >= 0 ? currentIndex.value + 1 : null));

const currentLabelKey = computed(() => {
  if (props.state === 'finishing') return props.finishingLabelKey;
  if (currentIndex.value >= 0 && props.currentStepKey) {
    return props.stepLabelKeys[props.currentStepKey] ?? props.preparingLabelKey;
  }
  return props.preparingLabelKey;
});
</script>

<style scoped>
/* A soft white highlight travelling left→right across the whole bar — signals the
   job is actively progressing, on top of the determinate done/remaining fill. */
.bjp-sweep {
  background: linear-gradient(
    90deg,
    transparent,
    color-mix(in srgb, var(--color-primary-foreground) 24%, transparent),
    transparent
  );
  transform: translateX(-100%);
  animation: bjp-sweep 1.4s linear infinite;
}

@keyframes bjp-sweep {
  to {
    transform: translateX(100%);
  }
}

@media (prefers-reduced-motion: reduce) {
  .bjp-sweep {
    animation: none;
  }
}
</style>
