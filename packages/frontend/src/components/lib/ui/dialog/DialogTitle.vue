<script setup lang="ts">
import { cn } from '@/lib/utils';
import { DialogTitle, type DialogTitleProps, useForwardProps } from 'reka-ui';
import { type HTMLAttributes, computed } from 'vue';

const props = defineProps<DialogTitleProps & { class?: HTMLAttributes['class'] }>();

const delegatedProps = computed(() => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { class: _, ...delegated } = props;

  return delegated;
});

const forwardedProps = useForwardProps(delegatedProps);
</script>

<template>
  <DialogTitle
    v-bind="forwardedProps"
    tabindex="0"
    :class="cn('text-lg leading-none font-semibold tracking-tight', props.class)"
  >
    <slot />
  </DialogTitle>
</template>
