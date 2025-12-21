<script lang="ts" setup>
import * as Popover from '@/components/lib/ui/popover';
import * as Tooltip from '@/components/lib/ui/tooltip';
import { cn } from '@/lib/utils';
import { createReusableTemplate, useMediaQuery } from '@vueuse/core';

const [UseTemplate, SlotContent] = createReusableTemplate();
// Detect touch-primary devices (coarse pointer = finger/stylus)
const isTouch = useMediaQuery('(pointer: coarse)');

defineProps<{
  content?: string;
  contentClassName?: string;
}>();
</script>

<template>
  <UseTemplate>
    <slot name="content">
      {{ content }}
    </slot>
  </UseTemplate>

  <!-- Touch devices: Popover (tap to open) -->
  <template v-if="isTouch">
    <Popover.Popover>
      <Popover.PopoverTrigger as-child :class="$attrs.class">
        <slot />
      </Popover.PopoverTrigger>

      <Popover.PopoverContent :class="cn('w-max max-w-[250px] p-2 text-sm', contentClassName)">
        <SlotContent />
      </Popover.PopoverContent>
    </Popover.Popover>
  </template>

  <!-- Non-touch devices: Tooltip (hover to show) -->
  <template v-else>
    <Tooltip.TooltipProvider>
      <Tooltip.Tooltip>
        <Tooltip.TooltipTrigger as-child :class="$attrs.class">
          <slot />
        </Tooltip.TooltipTrigger>

        <Tooltip.TooltipContent :class="contentClassName">
          <SlotContent />
        </Tooltip.TooltipContent>
      </Tooltip.Tooltip>
    </Tooltip.TooltipProvider>
  </template>
</template>
