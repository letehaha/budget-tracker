<script setup lang="ts">
import { cn } from '@/lib/utils';
import { Label, type LabelProps } from 'radix-vue';

const props = defineProps<LabelProps & { class?: string }>();
</script>

<template>
  <Label v-bind="props" :class="cn('text-foreground block text-left text-sm font-medium tracking-tight', props.class)">
    <slot />
  </Label>
</template>
