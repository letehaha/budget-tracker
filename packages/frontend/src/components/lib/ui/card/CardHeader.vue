<script setup lang="ts">
import { cn } from '@/lib/utils';

const props = withDefaults(defineProps<{ class?: string | string[] }>(), {
  class: '',
});
</script>

<template>
  <div :class="cn('flex flex-col space-y-1.5 py-2 px-6 sm:py-6', props.class)">
    <slot />
  </div>
</template>
