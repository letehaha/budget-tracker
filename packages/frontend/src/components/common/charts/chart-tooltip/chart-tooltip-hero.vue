<script setup lang="ts">
import { cn } from '@/lib/utils';
import type { HTMLAttributes } from 'vue';

const props = defineProps<{
  label?: string;
  valueClass?: HTMLAttributes['class'];
}>();
</script>

<template>
  <div class="mb-2">
    <div v-if="label" class="text-card-tooltip-muted text-xs">{{ label }}</div>
    <div :class="cn('text-xl font-semibold tracking-tight tabular-nums', props.valueClass)">
      <slot />
    </div>
  </div>
</template>
