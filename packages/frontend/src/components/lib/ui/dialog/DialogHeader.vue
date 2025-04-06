<script setup lang="ts">
import { cn } from '@/lib/utils';
import type { HTMLAttributes } from 'vue';

const props = defineProps<{
  class?: HTMLAttributes['class'];
}>();
</script>

<template>
  <div :class="cn('flex pr-8 flex-col gap-y-1.5 text-center sm:text-left', props.class)">
    <slot />
  </div>
</template>
