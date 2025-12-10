<script setup lang="ts">
import { cn } from '@/lib/utils';
import { reactiveOmit } from '@vueuse/core';
import type { ComboboxSeparatorProps } from 'reka-ui';
import { ComboboxSeparator } from 'reka-ui';
import type { HTMLAttributes } from 'vue';

const props = defineProps<ComboboxSeparatorProps & { class?: HTMLAttributes['class'] }>();

const delegatedProps = reactiveOmit(props, 'class');
</script>

<template>
  <ComboboxSeparator v-bind="delegatedProps" :class="cn('bg-border -mx-1 h-px', props.class)">
    <slot />
  </ComboboxSeparator>
</template>
