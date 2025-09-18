<script setup lang="ts">
import { cn } from '@/lib/utils';
import { useAttrs } from 'vue';

const attrs = useAttrs();
withDefaults(
  defineProps<{
    as?: 'div' | 'form';
  }>(),
  {
    as: 'div',
  },
);
</script>

<template>
  <component :is="as" :class="cn('bg-card text-card-foreground rounded-lg border shadow-xs', attrs.class)">
    <slot />
  </component>
</template>
