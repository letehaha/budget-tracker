<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '.';

const props = defineProps<{
  content: string;
  contentClassName?: string;
  disabled?: boolean;
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
      <TooltipContent :class="contentClassName">
        {{ content }}
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
  <slot v-else />
</template>
