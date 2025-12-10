<script setup lang="ts">
import { cn } from '@/lib/utils';
import { Separator, type SeparatorProps } from 'reka-ui';

const props = defineProps<SeparatorProps & { class?: string | string[] }>();
</script>

<template>
  <Separator
    :class="[cn('bg-border shrink-0', props.class), props.orientation === 'vertical' ? 'h-full w-px' : 'h-px w-full']"
  />
</template>
