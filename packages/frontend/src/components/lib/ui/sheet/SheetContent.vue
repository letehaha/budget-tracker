<script setup lang="ts">
import Button from '@/components/lib/ui/button/Button.vue';
import { cn } from '@/lib/utils';
import { XIcon } from 'lucide-vue-next';
import {
  DialogClose,
  DialogContent,
  type DialogContentEmits,
  type DialogContentProps,
  DialogOverlay,
  DialogPortal,
  useForwardPropsEmits,
} from 'reka-ui';
import { type HTMLAttributes, computed } from 'vue';

import { type SheetVariants, sheetVariants } from '../sheet';

interface SheetContentProps extends DialogContentProps {
  class?: HTMLAttributes['class'];
  side?: SheetVariants['side'];
}

defineOptions({
  inheritAttrs: false,
});

const props = defineProps<SheetContentProps>();

const emits = defineEmits<DialogContentEmits>();

const delegatedProps = computed(() => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { class: _, side, ...delegated } = props;

  return delegated;
});

const forwarded = useForwardPropsEmits(delegatedProps, emits);
</script>

<template>
  <DialogPortal>
    <DialogOverlay
      :class="[
        'fixed inset-0 z-(--z-dialog) bg-black/80',
        'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
      ]"
    />
    <DialogContent :class="cn(sheetVariants({ side }), props.class)" v-bind="{ ...forwarded, ...$attrs }">
      <slot />

      <DialogClose
        as-child
        :class="[
          'ring-offset-background absolute top-4 right-4 rounded-sm',
          'focus:ring-ring focus:ring-2 focus:ring-offset-2 focus:outline-hidden',
          'disabled:pointer-events-none',
          'data-[state=open]:bg-secondary',
        ]"
      >
        <Button size="icon" variant="secondary">
          <XIcon class="size-5" />
        </Button>
      </DialogClose>
    </DialogContent>
  </DialogPortal>
</template>
