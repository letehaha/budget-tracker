<script setup lang="ts">
import { cn } from '@/lib/utils';
import { reactiveOmit } from '@vueuse/core';
import type { ComboboxLabelProps } from 'radix-vue';
import { ComboboxLabel } from 'radix-vue';
import type { HTMLAttributes } from 'vue';

const props = defineProps<
  ComboboxLabelProps & {
    class?: HTMLAttributes['class'];
    heading?: string;
  }
>();

const delegatedProps = reactiveOmit(props, 'class', 'heading');
</script>

<template>
  <ComboboxLabel
    v-bind="delegatedProps"
    :class="cn('text-muted-foreground px-6 py-1 text-xs font-medium', props.class)"
  >
    {{ heading }}
    <slot />
  </ComboboxLabel>
</template>
