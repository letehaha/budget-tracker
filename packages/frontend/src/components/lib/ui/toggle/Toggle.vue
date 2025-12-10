<script setup lang="ts">
import { cn } from '@/lib/utils';
import type { VariantProps } from 'class-variance-authority';
import type { ToggleEmits, ToggleProps } from 'reka-ui';
import { Toggle, useForwardPropsEmits } from 'reka-ui';
import { computed, useAttrs } from 'vue';

import { toggleVariants } from '../toggle';

interface ToggleVariantProps extends VariantProps<typeof toggleVariants> {}

interface Props extends ToggleProps {
  variant?: ToggleVariantProps['variant'];
  size?: ToggleVariantProps['size'];
  disabled?: boolean;
}

defineOptions({
  inheritAttrs: false,
});

const props = withDefaults(defineProps<Props>(), {
  variant: 'default',
  size: 'default',
  disabled: false,
});
const emits = defineEmits<ToggleEmits>();

const toggleProps = computed(() => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { variant, size, disabled, ...otherProps } = props;
  return otherProps;
});

const { class: className, ...rest } = useAttrs();
const forwarded = useForwardPropsEmits(toggleProps.value, emits);
</script>

<template>
  <Toggle
    v-bind="{
      ...forwarded,
      ...rest,
    }"
    :class="cn(toggleVariants({ variant, size }), className ?? '')"
    :disabled="props.disabled"
  >
    <slot />
  </Toggle>
</template>
