<script setup lang="ts">
import { cn } from '@/lib/utils';
import type { HTMLAttributes } from 'vue';

const props = defineProps<{
  /** Series key dot color. Omit for rows without a series (totals, single metrics). */
  color?: string;
  label?: string;
  value?: string;
  valueClass?: HTMLAttributes['class'];
  /** Total rows drop the muted label treatment and bold the value. */
  total?: boolean;
}>();
</script>

<template>
  <div class="flex min-w-0 items-baseline gap-2 py-0.5">
    <span v-if="color" class="size-2 shrink-0 self-center rounded-full" :style="{ backgroundColor: color }" />
    <span
      :class="
        cn(
          'flex min-w-0 flex-1 items-center gap-1.5',
          total ? 'text-card-tooltip-foreground font-medium' : 'text-card-tooltip-muted',
        )
      "
    >
      <span class="truncate">
        <slot name="label">{{ label }}</slot>
      </span>
      <slot name="label-extra" />
    </span>
    <span
      :class="
        cn(
          'shrink-0 text-right whitespace-nowrap tabular-nums',
          total ? 'font-semibold' : 'font-medium',
          props.valueClass,
        )
      "
    >
      <slot name="value">{{ value }}</slot>
    </span>
  </div>
</template>
