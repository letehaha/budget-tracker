<script setup lang="ts">
import { cn } from '@/lib/utils';
import { reactiveOmit } from '@vueuse/core';
import type { ComboboxAnchorProps } from 'radix-vue';
import { ComboboxAnchor, useForwardProps } from 'radix-vue';
import type { HTMLAttributes } from 'vue';

const props = defineProps<ComboboxAnchorProps & { class?: HTMLAttributes['class'] }>();

const delegatedProps = reactiveOmit(props, 'class');

const forwarded = useForwardProps(delegatedProps);
</script>

<template>
  <ComboboxAnchor
    v-bind="forwarded"
    :class="
      cn(
        'border-input bg-background ring-offset-background focus-visible:ring-ring flex w-full justify-between rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50',
        props.class,
      )
    "
  >
    <slot />
  </ComboboxAnchor>
</template>
