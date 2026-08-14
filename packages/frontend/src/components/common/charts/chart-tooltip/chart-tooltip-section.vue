<script setup lang="ts">
import { cn } from '@/lib/utils';
import type { HTMLAttributes } from 'vue';

const props = defineProps<{
  label: string;
  value?: string;
  valueClass?: HTMLAttributes['class'];
}>();
</script>

<template>
  <div class="text-card-tooltip-muted mt-2 mb-0.5 flex min-w-0 items-baseline gap-2 first:mt-0">
    <span class="min-w-0 flex-1 truncate text-[10.5px] font-semibold tracking-wide uppercase">{{ label }}</span>
    <span
      v-if="value !== undefined"
      :class="cn('shrink-0 text-xs font-semibold whitespace-nowrap tabular-nums', props.valueClass)"
    >
      {{ value }}
    </span>
  </div>
</template>
