<script setup lang="ts">
import { cn } from '@/lib/utils';
import { ScrollAreaScrollbar, type ScrollAreaScrollbarProps, ScrollAreaThumb } from 'reka-ui';

const props = withDefaults(defineProps<ScrollAreaScrollbarProps>(), {
  orientation: 'vertical',
});
</script>

<template>
  <ScrollAreaScrollbar
    v-bind="props"
    :class="
      cn(
        'z-(--z-scrollbar) flex touch-none transition-colors select-none',
        orientation === 'vertical' && 'h-full w-2.5 border-l border-l-transparent p-px',
        // flex-col so the thumb's flex-1 fills the cross axis, not the track.
        orientation === 'horizontal' && 'h-2.5 flex-col border-t border-t-transparent p-px',
        $attrs.class ?? '',
      )
    "
  >
    <ScrollAreaThumb class="bg-border relative flex-1 rounded-full" />
  </ScrollAreaScrollbar>
</template>
