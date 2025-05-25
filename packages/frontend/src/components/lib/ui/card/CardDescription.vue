<script setup lang="ts">
import { cn } from '@/lib/utils';

const props = defineProps({
  class: {
    type: String,
    default: '',
  },
});
</script>

<template>
  <p :class="cn('text-muted-foreground text-sm', props.class)">
    <slot />
  </p>
</template>
