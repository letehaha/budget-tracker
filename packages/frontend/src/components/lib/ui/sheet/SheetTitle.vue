<script setup lang="ts">
import { cn } from '@/lib/utils';
import { DialogTitle, type DialogTitleProps } from 'reka-ui';
import { type HTMLAttributes, computed } from 'vue';

const props = defineProps<DialogTitleProps & { class?: HTMLAttributes['class'] }>();

const delegatedProps = computed(() => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { class: _, ...delegated } = props;

  return delegated;
});
</script>

<template>
  <DialogTitle :class="cn('text-foreground text-lg font-semibold', props.class)" v-bind="delegatedProps">
    <slot />
  </DialogTitle>
</template>
