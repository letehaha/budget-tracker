<script setup lang="ts">
import { cn } from '@/lib/utils';
import { Primitive, type PrimitiveProps } from 'radix-vue';

import { type ButtonVariantProps, buttonVariants } from '../button';

interface Props extends PrimitiveProps {
  variant?: ButtonVariantProps['variant'];
  size?: ButtonVariantProps['size'];
  as?: string;
}

withDefaults(defineProps<Props>(), {
  variant: 'default',
  size: 'default',
  as: 'button',
});
</script>

<template>
  <Primitive :as="as" :as-child="asChild" :class="cn(buttonVariants({ variant, size }), $attrs.class ?? '')">
    <slot />
  </Primitive>
</template>
