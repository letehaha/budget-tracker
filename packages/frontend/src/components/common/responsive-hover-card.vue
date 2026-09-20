<script lang="ts" setup>
import * as HoverCard from '@/components/lib/ui/hover-card';
import * as Popover from '@/components/lib/ui/popover';
import { cn } from '@/lib/utils';
import { createReusableTemplate, useMediaQuery } from '@vueuse/core';

defineOptions({ inheritAttrs: false });

const [UseTemplate, SlotContent] = createReusableTemplate();
// Detect touch-primary devices (coarse pointer = finger/stylus)
const isTouch = useMediaQuery('(pointer: coarse)');

withDefaults(
  defineProps<{
    side?: 'top' | 'right' | 'bottom' | 'left';
    align?: 'start' | 'center' | 'end';
    openDelay?: number;
    closeDelay?: number;
    contentClassName?: string;
  }>(),
  { side: 'right', align: 'start', openDelay: 100, closeDelay: 150 },
);

const open = defineModel<boolean>('open', { default: false });

const COLLISION_PADDING = 8;
// The panel is its own scroll container: reka publishes the space it fitted the content into as a
// custom property, which caps the height while the content scrolls inside. A nested ScrollArea
// cannot be used here, as its percentage-height viewport does not resolve against a max-height.
const shellClass = 'overflow-y-auto overscroll-contain p-2';
</script>

<template>
  <UseTemplate>
    <slot name="content" />
  </UseTemplate>

  <!-- Touch devices: Popover (tap to open) -->
  <template v-if="isTouch">
    <Popover.Popover v-model:open="open">
      <Popover.PopoverTrigger as-child :class="$attrs.class">
        <slot />
      </Popover.PopoverTrigger>

      <Popover.PopoverContent
        :side="side"
        :align="align"
        :collision-padding="COLLISION_PADDING"
        :class="cn(shellClass, 'max-h-[var(--reka-popover-content-available-height)]', contentClassName)"
      >
        <SlotContent />
      </Popover.PopoverContent>
    </Popover.Popover>
  </template>

  <!-- Hover devices: HoverCard, whose grace area keeps the panel open while the pointer crosses
       the gap between the trigger and the content -->
  <template v-else>
    <HoverCard.HoverCard v-model:open="open" :open-delay="openDelay" :close-delay="closeDelay">
      <HoverCard.HoverCardTrigger as-child :class="$attrs.class">
        <slot />
      </HoverCard.HoverCardTrigger>

      <HoverCard.HoverCardContent
        :side="side"
        :align="align"
        :collision-padding="COLLISION_PADDING"
        :class="cn(shellClass, 'max-h-[var(--reka-hover-card-content-available-height)]', contentClassName)"
      >
        <SlotContent />
      </HoverCard.HoverCardContent>
    </HoverCard.HoverCard>
  </template>
</template>
