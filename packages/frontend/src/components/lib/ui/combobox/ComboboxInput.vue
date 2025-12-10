<script setup lang="ts">
import { cn } from '@/lib/utils';
import { reactiveOmit } from '@vueuse/core';
import { ComboboxInput, type ComboboxInputProps, useForwardPropsEmits } from 'reka-ui';
import type { HTMLAttributes } from 'vue';

const props = defineProps<
  ComboboxInputProps & {
    class?: HTMLAttributes['class'];
  }
>();

// const emits = defineEmits()

const delegatedProps = reactiveOmit(props, 'class');

const forwarded = useForwardPropsEmits(delegatedProps);
</script>

<template>
  <ComboboxInput
    :type="'text'"
    v-bind="forwarded"
    :class="cn('placeholder:text-muted-foreground w-full bg-transparent text-sm outline-none', props.class)"
  >
    <slot />
  </ComboboxInput>
</template>
