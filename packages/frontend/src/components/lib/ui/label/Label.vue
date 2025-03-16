<script setup lang="ts">
import { cn } from '@/lib/utils';
import { Label, type LabelProps } from 'radix-vue';

const props = defineProps<LabelProps & { class?: string }>();
</script>

<template>
  <Label v-bind="props" :class="cn('block text-sm tracking-tight font-medium text-foreground text-left', props.class)">
    <slot />
  </Label>
</template>
