<script setup lang="ts">
import { cn } from '@/lib/utils';
import { ScrollAreaCorner, ScrollAreaRoot, type ScrollAreaRootProps, ScrollAreaViewport } from 'radix-vue';
import { ref } from 'vue';

import ScrollBar from './ScrollBar.vue';

const props = withDefaults(defineProps<ScrollAreaRootProps & { class?: string; scrollY?: () => void }>(), {
  class: '',
  orientation: 'vertical',
  scrollY: undefined,
});
const viewportRef = ref<HTMLElement | null>(null);
defineExpose({ viewportRef });
</script>

<template>
  <ScrollAreaRoot :type="type" :class="cn('relative overflow-hidden', props.class)">
    <ScrollAreaViewport ref="viewportRef" class="h-full w-full rounded-[inherit]" @scroll="scrollY">
      <slot />
    </ScrollAreaViewport>
    <ScrollBar />
    <ScrollAreaCorner />
  </ScrollAreaRoot>
</template>
