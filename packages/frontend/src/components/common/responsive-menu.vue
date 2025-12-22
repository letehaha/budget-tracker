<script lang="ts" setup>
import * as Drawer from '@/components/lib/ui/drawer';
import * as Popover from '@/components/lib/ui/popover';
import { CUSTOM_BREAKPOINTS, useWindowBreakpoints } from '@/composable/window-breakpoints';
import { createReusableTemplate } from '@vueuse/core';

const [UseTemplate, SlotContent] = createReusableTemplate();
const isMobile = useWindowBreakpoints(CUSTOM_BREAKPOINTS.uiMobile);

const props = defineProps<{ open?: boolean }>();

const emit = defineEmits(['update:open']);

const close = () => {
  emit('update:open', false);
};

defineExpose({ close });
</script>

<template>
  <UseTemplate>
    <slot :close="close" />
  </UseTemplate>

  <template v-if="isMobile">
    <Drawer.Drawer :open="props.open" @update:open="emit('update:open', $event)">
      <Drawer.DrawerTrigger as-child>
        <slot name="trigger" />
      </Drawer.DrawerTrigger>

      <Drawer.DrawerContent class="px-4 pb-6">
        <Drawer.DrawerHeader class="sr-only">
          <Drawer.DrawerTitle>Actions</Drawer.DrawerTitle>
          <Drawer.DrawerDescription>Choose an action</Drawer.DrawerDescription>
        </Drawer.DrawerHeader>

        <div class="mt-4 flex flex-col gap-1">
          <SlotContent />
        </div>
      </Drawer.DrawerContent>
    </Drawer.Drawer>
  </template>
  <template v-else>
    <Popover.Popover :open="props.open" @update:open="emit('update:open', $event)">
      <Popover.PopoverTrigger as-child>
        <slot name="trigger" />
      </Popover.PopoverTrigger>

      <Popover.PopoverContent align="end" class="w-48 p-1">
        <SlotContent />
      </Popover.PopoverContent>
    </Popover.Popover>
  </template>
</template>
