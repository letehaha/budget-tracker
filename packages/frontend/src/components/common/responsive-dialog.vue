<script lang="ts" setup>
import * as Dialog from '@/components/lib/ui/dialog';
import * as Drawer from '@/components/lib/ui/drawer';
import { CUSTOM_BREAKPOINTS, useWindowBreakpoints } from '@/composable/window-breakpoints';
import { createReusableTemplate, useVModel } from '@vueuse/core';
import type { HTMLAttributes } from 'vue';
import { ref } from 'vue';

const [UseTemplate, SlotContent] = createReusableTemplate();
const [UseFooterTemplate, FooterSlotContent] = createReusableTemplate();
const [UseScrollArea, ScrollAreaContent] = createReusableTemplate();
const isMobile = useWindowBreakpoints(CUSTOM_BREAKPOINTS.uiMobile);

const props = defineProps<{
  open?: boolean;
  dialogContentClass?: HTMLAttributes['class'];
  drawerContentClass?: HTMLAttributes['class'];
  customClose?: boolean;
}>();

const emit = defineEmits(['update:open']);

const isOpen = useVModel(props, 'open', emit, { passive: true });

const close = () => {
  isOpen.value = false;
};

const canScrollUp = ref(false);
const canScrollDown = ref(false);

const updateScrollState = ({ el }: { el: HTMLElement }) => {
  canScrollUp.value = el.scrollTop > 0;
  canScrollDown.value = el.scrollTop + el.clientHeight < el.scrollHeight - 1;
};

const onScroll = (e: Event) => {
  updateScrollState({ el: e.target as HTMLElement });
};

const onScrollAreaMounted = (el: unknown) => {
  if (el instanceof HTMLElement) {
    updateScrollState({ el });
  }
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
    <div
      :ref="(el) => onScrollAreaMounted(el)"
      class="scrollable-area min-h-0 flex-1 overflow-y-auto"
      :data-can-scroll-up="canScrollUp"
      :data-can-scroll-down="canScrollDown"
      @scroll="onScroll"
    >
      <SlotContent />
    </div>
  </UseScrollArea>

  <template v-if="isMobile">
    <Drawer.Drawer v-model:open="isOpen">
      <Drawer.DrawerTrigger as-child>
        <slot name="trigger" />
      </Drawer.DrawerTrigger>

      <Drawer.DrawerContent :class="['px-4 pb-4', drawerContentClass]">
        <component
          :is="$slots.title || $slots.description ? Drawer.DrawerHeader : 'div'"
          class="mb-2 px-0 pb-0 text-center"
        >
          <Drawer.DrawerTitle>
            <slot name="title" />
          </Drawer.DrawerTitle>
          <Drawer.DrawerDescription>
            <slot name="description" />
          </Drawer.DrawerDescription>
        </component>

        <ScrollAreaContent />

        <Drawer.DrawerFooter v-if="$slots.footer" class="px-0">
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

      <Dialog.DialogContent :class="dialogContentClass" :custom-close="customClose">
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

<style scoped>
.scrollable-area {
  position: relative;
  mask-image: linear-gradient(
    to bottom,
    transparent 0,
    black var(--scroll-fade-top, 0px),
    black calc(100% - var(--scroll-fade-bottom, 0px)),
    transparent 100%
  );
}

.scrollable-area[data-can-scroll-up='true'] {
  --scroll-fade-top: 16px;
}

.scrollable-area[data-can-scroll-down='true'] {
  --scroll-fade-bottom: 16px;
}
</style>
