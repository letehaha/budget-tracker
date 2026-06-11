<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '.';

const props = defineProps<{
  /** Plain-text tooltip body; ignored when the `content` slot is provided. */
  content?: string;
  contentClassName?: string;
  disabled?: boolean;
  side?: 'top' | 'right' | 'bottom' | 'left';
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
</script>

<template>
  <TooltipProvider v-if="hasHover && !props.disabled" :delay-duration="100">
    <Tooltip>
      <TooltipTrigger as-child>
        <slot />
      </TooltipTrigger>
      <TooltipContent :class="contentClassName" :side="props.side">
        <slot name="content">{{ content }}</slot>
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
  <slot v-else />
</template>
