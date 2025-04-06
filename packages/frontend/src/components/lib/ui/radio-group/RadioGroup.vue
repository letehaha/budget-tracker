<script setup lang="ts">
import { cn } from '@/lib/utils';
import { RadioGroupRoot, type RadioGroupRootEmits, type RadioGroupRootProps, useForwardPropsEmits } from 'radix-vue';
import { type HTMLAttributes, computed } from 'vue';

const props = defineProps<RadioGroupRootProps & { class?: HTMLAttributes['class'] }>();
const emits = defineEmits<RadioGroupRootEmits>();

const delegatedProps = computed(() => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { class: _, ...delegated } = props;

  return delegated;
});

const forwarded = useForwardPropsEmits(delegatedProps, emits);
</script>

<template>
  <RadioGroupRoot :class="cn('grid gap-2', props.class)" v-bind="forwarded">
    <slot />
  </RadioGroupRoot>
</template>
