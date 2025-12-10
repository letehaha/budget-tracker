<script setup lang="ts">
import { cn } from '@/lib/utils';
import { reactiveOmit } from '@vueuse/core';
import type { ComboboxViewportProps } from 'reka-ui';
import { ComboboxViewport } from 'reka-ui';
import type { HTMLAttributes } from 'vue';

const props = defineProps<
  ComboboxViewportProps & {
    class?: HTMLAttributes['class'];
    nonce?: string;
  }
>();

const delegatedProps = reactiveOmit(props, 'class');
</script>

<template>
  <ComboboxViewport v-bind="delegatedProps" :class="cn('p-1', props.class)">
    <slot />
  </ComboboxViewport>
</template>
