<template>
  <ol class="mt-6 grid gap-2.5 text-left text-sm">
    <li
      v-for="(row, index) in rows"
      :key="index"
      class="flex items-center gap-2.5 transition-colors duration-500"
      :class="ROW_CLASS[row.status]"
      :aria-current="row.status === 'now' ? 'step' : undefined"
    >
      <span class="relative flex size-4.5 shrink-0 items-center justify-center">
        <svg
          class="absolute inset-0 size-full transition-colors duration-500"
          :class="RING_CLASS[row.status]"
          viewBox="0 0 18 18"
          fill="none"
          aria-hidden="true"
        >
          <circle
            cx="9"
            cy="9"
            r="7.25"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            class="transition-[stroke-dasharray] duration-500"
            :stroke-dasharray="row.status === 'now' ? RING_ARC : RING_FULL"
          />
        </svg>
        <Transition name="mark" mode="out-in">
          <CheckIcon v-if="row.status === 'done'" class="text-success-text size-3" aria-hidden="true" />
          <span v-else-if="row.status === 'now'" class="bg-primary size-2 rounded-full" aria-hidden="true" />
        </Transition>
      </span>
      <span class="min-w-0 flex-1 truncate">{{ $t(row.labelKey) }}</span>
      <slot v-if="row.status === 'now'" name="trailing" />
    </li>
  </ol>
</template>

<script setup lang="ts">
import { CheckIcon } from '@lucide/vue';
import { computed } from 'vue';

import { type ChecklistRowStatus, checklistRows } from './blocking-job-progress.helpers';

const props = defineProps<{
  /** Job steps in backend execution order. */
  orderedStepKeys: string[];
  /** Step key → i18n label key. */
  stepLabelKeys: Record<string, string>;
  state: 'preparing' | 'running' | 'finishing';
  currentStepKey?: string | null;
  preparingLabelKey: string;
  finishingLabelKey: string;
}>();

const ROW_CLASS: Record<ChecklistRowStatus, string> = {
  done: 'text-foreground',
  now: 'text-foreground font-semibold',
  pending: 'text-muted-foreground',
};

// Done rows keep animate-spin: dropping it would snap the closing arc back to 0°,
// and a full circle rotating looks still.
const RING_CLASS: Record<ChecklistRowStatus, string> = {
  done: 'text-success-text animate-spin motion-reduce:animate-none',
  now: 'text-primary-text animate-spin motion-reduce:animate-none',
  pending: 'text-border',
};

const RING_CIRCUMFERENCE = 2 * Math.PI * 7.25;
const RING_FULL = `${RING_CIRCUMFERENCE} ${RING_CIRCUMFERENCE}`;
const RING_ARC = `${RING_CIRCUMFERENCE * 0.75} ${RING_CIRCUMFERENCE}`;

const rows = computed(() => checklistRows(props));
</script>

<style scoped>
.mark-enter-active,
.mark-leave-active {
  transition:
    opacity 200ms ease,
    transform 200ms ease;
}

.mark-enter-from,
.mark-leave-to {
  opacity: 0;
  transform: scale(0.4);
}

@media (prefers-reduced-motion: reduce) {
  .mark-enter-active,
  .mark-leave-active {
    transition: none;
  }
}
</style>
