<script setup lang="ts">
import { cn } from '@/lib/utils';
import { reactiveOmit } from '@vueuse/core';
import type { ComboboxItemIndicatorProps } from 'reka-ui';
import { ComboboxItemIndicator } from 'reka-ui';
import type { HTMLAttributes } from 'vue';

const props = defineProps<
  ComboboxItemIndicatorProps & {
    class?: HTMLAttributes['class'];
  }
>();

const delegatedProps = reactiveOmit(props, 'class');
</script>

<template>
  <ComboboxItemIndicator
    v-bind="delegatedProps"
    :class="cn('absolute left-0 inline-flex w-[25px] items-center justify-center', props.class)"
  >
    <slot />
  </ComboboxItemIndicator>
</template>
