<script setup lang="ts">
import { TooltipProvider, type TooltipProviderProps } from 'reka-ui';

const props = withDefaults(defineProps<TooltipProviderProps>(), {
  disableClosingTrigger: true,
});
</script>

<template>
  <TooltipProvider v-bind="props">
    <slot />
  </TooltipProvider>
</template>
