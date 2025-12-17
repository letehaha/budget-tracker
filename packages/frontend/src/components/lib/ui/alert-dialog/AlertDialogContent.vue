<script setup lang="ts">
import { cn } from '@/lib/utils';
import {
  AlertDialogContent,
  type AlertDialogContentEmits,
  type AlertDialogContentProps,
  AlertDialogOverlay,
  AlertDialogPortal,
  useEmitAsProps,
} from 'reka-ui';

const props = defineProps<AlertDialogContentProps & { class?: string }>();
const emits = defineEmits<AlertDialogContentEmits>();

const emitsAsProps = useEmitAsProps(emits);
</script>

<template>
  <AlertDialogPortal>
    <AlertDialogOverlay
      :class="[
        'bg-background/80 fixed inset-0 z-(--z-dialog) backdrop-blur-xs',
        'data-[state=open]:animate-in data-[state=open]:fade-in-0',
        'data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
      ]"
    />
    <AlertDialogContent
      v-bind="{ ...props, ...emitsAsProps }"
      :class="
        cn(
          'border-border bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-(--z-dialog) grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] grid-cols-1 gap-4 border p-6 shadow-lg duration-200 sm:rounded-lg md:w-full',
          props.class,
        )
      "
    >
      <slot />
    </AlertDialogContent>
  </AlertDialogPortal>
</template>
