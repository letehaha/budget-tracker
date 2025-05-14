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
  <div :class="cn('p-2 pt-0 sm:p-6', props.class)">
    <slot />
  </div>
</template>
