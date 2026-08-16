<script lang="ts" setup>
import { Button } from '@/components/lib/ui/button';
import { cn } from '@/lib/utils';

defineProps<{ active?: boolean }>();
</script>

<template>
  <Button
    type="button"
    variant="ghost"
    size="sm"
    :class="
      cn(
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
