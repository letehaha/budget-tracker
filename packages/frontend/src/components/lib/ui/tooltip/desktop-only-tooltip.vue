<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '.';

defineProps<{
  content: string;
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
  <TooltipProvider v-if="hasHover" :delay-duration="100">
    <Tooltip>
      <TooltipTrigger as-child>
        <slot />
      </TooltipTrigger>
      <TooltipContent>
        {{ content }}
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
  <slot v-else />
</template>
