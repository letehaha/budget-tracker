<script setup lang="ts">
import { cn } from '@/lib/utils';
import { DialogTitle, type DialogTitleProps } from 'radix-vue';
import { type HTMLAttributes, computed } from 'vue';

const props = defineProps<DialogTitleProps & { class?: HTMLAttributes['class'] }>();

const delegatedProps = computed(() => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { class: _, ...delegated } = props;

  return delegated;
});
</script>

<template>
  <DialogTitle :class="cn('text-lg font-semibold text-foreground', props.class)" v-bind="delegatedProps">
    <slot />
  </DialogTitle>
</template>
