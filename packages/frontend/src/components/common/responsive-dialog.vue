<script lang="ts" setup>
import * as Dialog from '@/components/lib/ui/dialog';
import * as Drawer from '@/components/lib/ui/drawer';
import { CUSTOM_BREAKPOINTS, useWindowBreakpoints } from '@/composable/window-breakpoints';
import { createReusableTemplate } from '@vueuse/core';

const [UseTemplate, SlotContent] = createReusableTemplate();
const isMobile = useWindowBreakpoints(CUSTOM_BREAKPOINTS.uiMobile);

const props = defineProps<{ open?: boolean }>();

const emit = defineEmits(['update:open']);
</script>

<template>
  <UseTemplate>
    <slot />
  </UseTemplate>

  <template v-if="isMobile">
    <Drawer.Drawer :open="props.open" @update:open="emit('update:open', $event)">
      <Drawer.DrawerTrigger as-child>
        <slot name="trigger" />
      </Drawer.DrawerTrigger>

      <Drawer.DrawerContent class="px-4 pb-4">
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

        <SlotContent />
      </Drawer.DrawerContent>
    </Drawer.Drawer>
  </template>
  <template v-else>
    <Dialog.Dialog :open="props.open" @update:open="emit('update:open', $event)">
      <Dialog.DialogTrigger as-child>
        <slot name="trigger" />
      </Dialog.DialogTrigger>

      <Dialog.DialogContent>
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

        <SlotContent />
      </Dialog.DialogContent>
    </Dialog.Dialog>
  </template>
</template>
