<script setup lang="ts">
import { cn } from '@/lib/utils';
import { SelectGroup, type SelectGroupProps } from 'radix-vue';
import { type HTMLAttributes, computed } from 'vue';

const props = defineProps<SelectGroupProps & { class?: HTMLAttributes['class'] }>();

const delegatedProps = computed(() => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { class: _, ...delegated } = props;

  return delegated;
});
</script>

<template>
  <SelectGroup :class="cn('w-full p-1', props.class)" v-bind="delegatedProps">
    <slot />
  </SelectGroup>
</template>
