<script setup lang="ts">
import { cn } from '@/lib/utils';
import { Separator, type SeparatorProps } from 'radix-vue';

const props = defineProps<SeparatorProps & { class?: string | string[] }>();
</script>

<template>
  <Separator
    :class="[cn('shrink-0 bg-border', props.class), props.orientation === 'vertical' ? 'w-px h-full' : 'h-px w-full']"
  />
</template>
