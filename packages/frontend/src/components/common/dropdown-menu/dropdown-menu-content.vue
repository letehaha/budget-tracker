<script setup lang="ts">
import { cn } from '@/lib/utils';
import {
  DropdownMenuContent,
  type DropdownMenuContentEmits,
  type DropdownMenuContentProps,
  useForwardPropsEmits,
} from 'radix-vue';

const props = withDefaults(defineProps<DropdownMenuContentProps>(), {
  sideOffset: 4,
});
const emits = defineEmits<DropdownMenuContentEmits>();

const forwarded = useForwardPropsEmits(props, emits);
</script>

<template>
  <DropdownMenuContent
    :class="
      cn(
        'bg-popover text-popover-foreground animate-in data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 min-w-[8rem] overflow-hidden rounded-md border p-1 shadow-md',
        $attrs.class ?? '',
      )
    "
    v-bind="forwarded"
  >
    <slot />
  </DropdownMenuContent>
</template>
