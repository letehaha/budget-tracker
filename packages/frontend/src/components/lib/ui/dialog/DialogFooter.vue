<script setup lang="ts">
import { cn } from '@/lib/utils';
import type { HTMLAttributes } from 'vue';

const props = defineProps<{ class?: HTMLAttributes['class'] }>();
</script>

<template>
  <div :class="cn('flex shrink-0 flex-col-reverse pt-4 sm:flex-row sm:justify-end sm:gap-x-2', props.class)">
    <slot />
  </div>
</template>
