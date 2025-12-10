<script lang="ts" setup>
import { cn } from '@/lib/utils';
import type { DialogContentEmits, DialogContentProps } from 'reka-ui';
import { useForwardPropsEmits } from 'reka-ui';
import { DrawerContent, DrawerPortal } from 'vaul-vue';
import type { HtmlHTMLAttributes } from 'vue';

import DrawerIndicator from './DrawerIndicator.vue';
import DrawerOverlay from './DrawerOverlay.vue';

const props = defineProps<
  DialogContentProps & {
    class?: HtmlHTMLAttributes['class'];
    customIndicator?: boolean;
  }
>();
const emits = defineEmits<DialogContentEmits>();

const forwarded = useForwardPropsEmits(props, emits);
</script>

<template>
  <DrawerPortal>
    <DrawerOverlay />
    <DrawerContent
      v-bind="forwarded"
      :class="
        cn(
          'bg-background fixed inset-x-0 bottom-0 z-(--z-dialog) mt-24 flex h-auto flex-col rounded-t-[10px] border pb-[env(safe-area-inset-bottom)]',
          props.class,
        )
      "
      :on-open-auto-focus="(e) => console.log(e)"
    >
      <template v-if="!customIndicator">
        <DrawerIndicator />
      </template>

      <slot />
    </DrawerContent>
  </DrawerPortal>
</template>
