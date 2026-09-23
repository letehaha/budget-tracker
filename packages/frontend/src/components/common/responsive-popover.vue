<script lang="ts" setup>
import * as Drawer from '@/components/lib/ui/drawer';
import * as Popover from '@/components/lib/ui/popover';
import { CUSTOM_BREAKPOINTS, useWindowBreakpoints } from '@/composable/window-breakpoints';
import { createReusableTemplate } from '@vueuse/core';
import type { HTMLAttributes } from 'vue';

const [UseTemplate, SlotContent] = createReusableTemplate();
const isMobile = useWindowBreakpoints(CUSTOM_BREAKPOINTS.uiMobile);

withDefaults(
  defineProps<{
    /** Names the drawer for screen readers; the content carries its own visible heading */
    title: string;
    align?: 'start' | 'center' | 'end';
    popoverClass?: HTMLAttributes['class'];
  }>(),
  { align: 'center' },
);
</script>

<template>
  <UseTemplate>
    <slot />
  </UseTemplate>

  <Drawer.Drawer v-if="isMobile">
    <Drawer.DrawerTrigger as-child>
      <slot name="trigger" />
    </Drawer.DrawerTrigger>

    <Drawer.DrawerContent class="px-4 pb-6">
      <Drawer.DrawerTitle class="sr-only">{{ title }}</Drawer.DrawerTitle>
      <div class="mt-4">
        <SlotContent />
      </div>
    </Drawer.DrawerContent>
  </Drawer.Drawer>

  <Popover.Popover v-else>
    <Popover.PopoverTrigger as-child>
      <slot name="trigger" />
    </Popover.PopoverTrigger>

    <Popover.PopoverContent :align="align" :class="popoverClass">
      <SlotContent />
    </Popover.PopoverContent>
  </Popover.Popover>
</template>
