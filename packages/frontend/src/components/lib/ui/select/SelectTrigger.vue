<script setup lang="ts">
import { cn } from '@/lib/utils';
import { ChevronDown } from 'lucide-vue-next';
import { SelectIcon, SelectTrigger, type SelectTriggerProps, useForwardProps } from 'radix-vue';
import { ComputedRef, type HTMLAttributes, computed, inject } from 'vue';

import { PROVIDER_NAME } from './types';

const props = defineProps<SelectTriggerProps & { class?: HTMLAttributes['class'] }>();

const delegatedProps = computed(() => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { class: _, ...delegated } = props;

  return delegated;
});

const forwardedProps = useForwardProps(delegatedProps);
const isOpen = inject<ComputedRef<boolean>>(PROVIDER_NAME);
</script>

<template>
  <SelectTrigger
    v-bind="forwardedProps"
    :class="
      cn(
        'flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 [&>span]:truncate text-start',
        props.class,
      )
    "
  >
    <slot />
    <SelectIcon as-child>
      <ChevronDown :class="['size-4 opacity-50 shrink-0', isOpen && 'rotate-180']" />
    </SelectIcon>
  </SelectTrigger>
</template>
