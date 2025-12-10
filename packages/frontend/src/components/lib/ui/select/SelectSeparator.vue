<script setup lang="ts">
import { cn } from '@/lib/utils';
import { SelectSeparator, type SelectSeparatorProps } from 'reka-ui';
import { type HTMLAttributes, computed } from 'vue';

const props = defineProps<SelectSeparatorProps & { class?: HTMLAttributes['class'] }>();

const delegatedProps = computed(() => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { class: _, ...delegated } = props;

  return delegated;
});
</script>

<template>
  <SelectSeparator v-bind="delegatedProps" :class="cn('bg-muted -mx-1 my-1 h-px', props.class)" />
</template>
