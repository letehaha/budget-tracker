<script lang="ts" setup>
import * as Dialog from '@/components/lib/ui/dialog';
import * as Drawer from '@/components/lib/ui/drawer';
import { ScrollArea } from '@/components/lib/ui/scroll-area';
import { CUSTOM_BREAKPOINTS, useWindowBreakpoints } from '@/composable/window-breakpoints';
import { createReusableTemplate, useVModel } from '@vueuse/core';
import type { HTMLAttributes } from 'vue';

const [UseTemplate, SlotContent] = createReusableTemplate();
const [UseFooterTemplate, FooterSlotContent] = createReusableTemplate();
const [UseScrollArea, ScrollAreaContent] = createReusableTemplate();
const isMobile = useWindowBreakpoints(CUSTOM_BREAKPOINTS.uiMobile);

const props = defineProps<{
  open?: boolean;
  dialogContentClass?: HTMLAttributes['class'];
  drawerContentClass?: HTMLAttributes['class'];
  customClose?: boolean;
  /** When true, disables the internal scroll wrapper (display: contents).
   * Use when the dialog content manages its own scrolling layout. */
  noInternalScroll?: boolean;
  /** When true, the footer slot is not rendered in drawer (mobile) mode.
   * Use when the footer only contains a close action — swipe-to-close is enough on mobile. */
  hideDrawerFooter?: boolean;
}>();

const emit = defineEmits(['update:open']);

const isOpen = useVModel(props, 'open', emit, { passive: true });

const close = () => {
  isOpen.value = false;
};
</script>

<template>
  <UseTemplate>
    <slot :close="close" />
  </UseTemplate>

  <UseFooterTemplate>
    <slot name="footer" :close="close" />
  </UseFooterTemplate>

  <UseScrollArea>
    <ScrollArea v-if="!props.noInternalScroll" class="-mx-1 min-h-0 flex-1" viewport-class="px-1">
      <SlotContent />
    </ScrollArea>
    <SlotContent v-else />
  </UseScrollArea>

  <template v-if="isMobile">
    <Drawer.Drawer v-model:open="isOpen">
      <Drawer.DrawerTrigger as-child>
        <slot name="trigger" />
      </Drawer.DrawerTrigger>

      <Drawer.DrawerContent
        :class="[
          !props.noInternalScroll && 'grid grid-rows-[auto_auto_minmax(0,1fr)_auto] overflow-hidden',
          'px-4 pb-4',
          drawerContentClass,
        ]"
      >
        <component
          :is="$slots.title || $slots.description ? Drawer.DrawerHeader : 'div'"
          class="mb-2 px-0 pt-6 pb-0 text-center"
        >
          <Drawer.DrawerTitle>
            <slot name="title" />
          </Drawer.DrawerTitle>
          <Drawer.DrawerDescription>
            <slot name="description" />
          </Drawer.DrawerDescription>
        </component>

        <ScrollAreaContent />

        <Drawer.DrawerFooter v-if="$slots.footer && !hideDrawerFooter" class="px-0">
          <FooterSlotContent />
        </Drawer.DrawerFooter>
      </Drawer.DrawerContent>
    </Drawer.Drawer>
  </template>
  <template v-else>
    <Dialog.Dialog v-model:open="isOpen">
      <Dialog.DialogTrigger as-child>
        <slot name="trigger" />
      </Dialog.DialogTrigger>

      <Dialog.DialogContent
        :class="[
          !props.noInternalScroll && 'grid grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden',
          dialogContentClass,
        ]"
        :custom-close="customClose"
      >
        <template v-if="$slots.title || $slots.description">
          <Dialog.DialogHeader class="mb-4 text-left">
            <Dialog.DialogTitle>
              <slot name="title" />
            </Dialog.DialogTitle>
            <Dialog.DialogDescription>
              <slot name="description" />
            </Dialog.DialogDescription>
          </Dialog.DialogHeader>
        </template>

        <ScrollAreaContent />

        <Dialog.DialogFooter v-if="$slots.footer">
          <FooterSlotContent />
        </Dialog.DialogFooter>
      </Dialog.DialogContent>
    </Dialog.Dialog>
  </template>
</template>
