<script setup lang="ts">
import { cn } from '@/lib/utils';
import { computed } from 'vue';

type RingTone = 'primary' | 'success' | 'warning';

const props = defineProps<{
  pct: number;
  tone: RingTone;
  label: string;
}>();

const VIEWBOX = 168;
const STROKE_WIDTH = 12;
const CENTER = VIEWBOX / 2;
const RADIUS = CENTER - STROKE_WIDTH / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const SEGMENTS = 4;
const SEGMENT_GAP = 10;
const SEGMENT_LENGTH = CIRCUMFERENCE / SEGMENTS - SEGMENT_GAP;
const SEGMENT_PCT = 100 / SEGMENTS;

const TONE_CLASSES: Record<RingTone, string> = {
  primary: 'stroke-primary-text',
  success: 'stroke-success-text',
  warning: 'stroke-warning-text',
};

const segmentRotation = ({ index }: { index: number }) =>
  `rotate(${(360 / SEGMENTS) * index + (SEGMENT_GAP / CIRCUMFERENCE) * 180} ${CENTER} ${CENTER})`;

const segments = computed(() =>
  Array.from({ length: SEGMENTS }, (_, index) => {
    const filledPct = Math.min(SEGMENT_PCT, Math.max(0, props.pct - SEGMENT_PCT * index));
    return { index, filled: (filledPct / SEGMENT_PCT) * SEGMENT_LENGTH };
  }),
);
</script>

<template>
  <div class="relative aspect-square" role="img" :aria-label="label">
    <svg :viewBox="`0 0 ${VIEWBOX} ${VIEWBOX}`" class="size-full -rotate-90" aria-hidden="true">
      <template v-for="segment in segments" :key="segment.index">
        <circle
          :cx="CENTER"
          :cy="CENTER"
          :r="RADIUS"
          fill="none"
          class="stroke-muted"
          :stroke-width="STROKE_WIDTH"
          :stroke-dasharray="`${SEGMENT_LENGTH} ${CIRCUMFERENCE}`"
          :transform="segmentRotation(segment)"
        />
        <circle
          v-if="segment.filled > 0"
          :cx="CENTER"
          :cy="CENTER"
          :r="RADIUS"
          fill="none"
          :class="cn('transition-[stroke-dasharray] duration-500', TONE_CLASSES[tone])"
          :stroke-width="STROKE_WIDTH"
          :stroke-dasharray="`${segment.filled} ${CIRCUMFERENCE}`"
          :transform="segmentRotation(segment)"
        />
      </template>
    </svg>
    <div class="absolute inset-0 flex flex-col items-center justify-center">
      <slot />
    </div>
  </div>
</template>
