<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '.';

const props = defineProps<{
  /** Plain-text tooltip body; ignored when the `content` slot is provided. */
  content?: string;
  contentClassName?: string;
  disabled?: boolean;
  side?: 'top' | 'right' | 'bottom' | 'left';
  /**
   * Only show the tooltip when the trigger's text is actually clipped. The
   * trigger must be the overflowing element itself (e.g. a `truncate` span);
   * on each hover it is measured and the tooltip is skipped when the text fits.
   * One read per hover – no eager measurement
   */
  onlyWhenTruncated?: boolean;
}>();

const hasHover = ref(false);

// Using matchMedia to detect hover capability - most reliable method
const updateHoverCapability = () => {
  hasHover.value = window.matchMedia('(hover: hover)').matches;
};

let mediaQuery: MediaQueryList | null = null;

onMounted(() => {
  mediaQuery = window.matchMedia('(hover: hover)');
  hasHover.value = mediaQuery.matches;
  mediaQuery.addEventListener('change', updateHoverCapability);
});

onUnmounted(() => {
  mediaQuery?.removeEventListener('change', updateHoverCapability);
});

// Starts armed so the first hover, which lands before the open delay, decides.
// Only consulted when `onlyWhenTruncated` is set.
const isTriggerTruncated = ref(true);
const measureTruncation = (event: MouseEvent) => {
  if (!props.onlyWhenTruncated) return;
  const el = event.currentTarget as HTMLElement;
  isTriggerTruncated.value = el.scrollWidth > el.clientWidth;
};
</script>

<template>
  <TooltipProvider v-if="hasHover && !props.disabled" :delay-duration="100">
    <Tooltip>
      <TooltipTrigger as-child @mouseenter="measureTruncation">
        <slot />
      </TooltipTrigger>
      <TooltipContent
        v-if="!props.onlyWhenTruncated || isTriggerTruncated"
        :class="contentClassName"
        :side="props.side"
      >
        <slot name="content">{{ content }}</slot>
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
  <slot v-else />
</template>
