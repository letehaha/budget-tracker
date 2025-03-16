<script setup lang="ts">
import { type ButtonVariantProps, buttonVariants } from '@/components/lib/ui/button';
import { cn } from '@/lib/utils';
import { AlertDialogAction, type AlertDialogActionProps } from 'radix-vue';

const props = defineProps<AlertDialogActionProps & { variant: ButtonVariantProps['variant'] }>();
</script>

<template>
  <AlertDialogAction v-bind="props" :class="cn(buttonVariants({ variant: variant ?? 'default' }), $attrs.class ?? '')">
    <slot />
  </AlertDialogAction>
</template>
