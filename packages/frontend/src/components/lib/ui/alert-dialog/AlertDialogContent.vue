<script setup lang="ts">
import { cn } from '@/lib/utils';
import {
  AlertDialogContent,
  type AlertDialogContentEmits,
  type AlertDialogContentProps,
  AlertDialogOverlay,
  AlertDialogPortal,
  useEmitAsProps,
} from 'radix-vue';

const props = defineProps<AlertDialogContentProps & { class?: string }>();
const emits = defineEmits<AlertDialogContentEmits>();

const emitsAsProps = useEmitAsProps(emits);
</script>

<template>
  <AlertDialogPortal>
    <AlertDialogOverlay
      :class="[
        'bg-background/80 fixed inset-0 z-50 backdrop-blur-sm',
        'data-[state=open]:animate-in data-[state=open]:fade-in-0',
        'data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
      ]"
    />
    <AlertDialogContent
      v-bind="{ ...props, ...emitsAsProps }"
      :class="
        cn(
          'border-border bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border p-6 shadow-lg duration-200 sm:rounded-lg md:w-full',
          props.class,
        )
      "
    >
      <slot />
    </AlertDialogContent>
  </AlertDialogPortal>
</template>
