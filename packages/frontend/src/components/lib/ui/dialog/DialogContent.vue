<script setup lang="ts">
import { Button } from '@/components/lib/ui/button';
import { cn } from '@/lib/utils';
import { X } from 'lucide-vue-next';
import {
  DialogClose,
  DialogContent,
  type DialogContentEmits,
  type DialogContentProps,
  DialogOverlay,
  DialogPortal,
  useForwardPropsEmits,
} from 'radix-vue';
import { type HTMLAttributes, computed } from 'vue';

const props = defineProps<
  DialogContentProps & {
    class?: HTMLAttributes['class'];
    customClose?: boolean;
  }
>();
const emits = defineEmits<DialogContentEmits>();

const delegatedProps = computed(() => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { class: _, ...delegated } = props;

  return delegated;
});

const forwarded = useForwardPropsEmits(delegatedProps, emits);
</script>

<template>
  <DialogPortal>
    <DialogOverlay
      :class="[
        'fixed inset-0 z-(--z-dialog) bg-black/80',
        'data-[state=open]:animate-in data-[state=open]:fade-in-0',
        'data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
      ]"
    />
    <DialogContent
      v-bind="forwarded"
      :class="
        cn(
          'bg-background fixed top-1/2 left-1/2 z-(--z-dialog) grid w-full max-w-lg -translate-x-1/2 -translate-y-1/2 border p-6 shadow-lg duration-200 sm:rounded-lg',
          'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
          'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
          props.class,
        )
      "
    >
      <slot />

      <template v-if="!customClose">
        <DialogClose class="absolute top-4 right-4" as-child>
          <Button variant="ghost" size="icon">
            <X class="size-4" />
            <span class="sr-only">Close</span>
          </Button>
        </DialogClose>
      </template>
    </DialogContent>
  </DialogPortal>
</template>
