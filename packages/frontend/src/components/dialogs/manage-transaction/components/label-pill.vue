<script lang="ts" setup>
import { Button } from '@/components/lib/ui/button';
import { cn } from '@/lib/utils';

withDefaults(
  defineProps<{
    active?: boolean;
    /**
     * `addon` attaches the pill flush to the right edge of a field rendered with its
     * right border/rounding stripped (the field's `field-right` slot); `pill` is the
     * standalone label-row chip.
     */
    variant?: 'pill' | 'addon';
  }>(),
  { variant: 'pill' },
);
</script>

<template>
  <Button
    type="button"
    variant="ghost"
    size="sm"
    :class="
      variant === 'addon'
        ? cn(
            'border-input bg-muted h-auto gap-1.5 self-stretch rounded-l-none rounded-r-md border px-3 text-xs font-medium transition-colors',
            active
              ? 'border-primary/60 bg-primary/20 text-primary-text hover:bg-primary/30 hover:text-primary-text'
              : 'hover:border-primary/50 hover:bg-muted hover:text-primary-text',
          )
        : cn(
            'h-auto gap-1.5 rounded-full border px-2 py-0.5 text-xs font-normal transition-colors hover:bg-transparent',
            active
              ? 'border-primary/60 bg-primary/20 text-primary-text hover:text-primary-text font-medium'
              : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground',
          )
    "
  >
    <slot />
  </Button>
</template>
