<script setup lang="ts">
import { cn } from '@/lib/utils';
import type { HTMLAttributes } from 'vue';

import { CHART_TOOLTIP_SIZING_CLASS, CHART_TOOLTIP_SURFACE_CLASS } from './surface';

const props = withDefaults(defineProps<{ class?: HTMLAttributes['class'] }>(), {
  class: '',
});
</script>

<template>
  <div :class="cn(CHART_TOOLTIP_SURFACE_CLASS, CHART_TOOLTIP_SIZING_CLASS, props.class)">
    <slot />
  </div>
</template>
