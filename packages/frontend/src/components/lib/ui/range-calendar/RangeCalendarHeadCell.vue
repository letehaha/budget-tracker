<script lang="ts" setup>
import { cn } from '@/lib/utils';
import { RangeCalendarHeadCell, type RangeCalendarHeadCellProps, useForwardProps } from 'reka-ui';
import { type HTMLAttributes, computed } from 'vue';

const props = defineProps<RangeCalendarHeadCellProps & { class?: HTMLAttributes['class'] }>();

const delegatedProps = computed(() => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { class: _, ...delegated } = props;

  return delegated;
});

const forwardedProps = useForwardProps(delegatedProps);
</script>

<template>
  <RangeCalendarHeadCell
    :class="cn('text-muted-foreground min-w-9 flex-1 rounded-md text-[0.8rem] font-normal', props.class)"
    v-bind="forwardedProps"
  >
    <slot />
  </RangeCalendarHeadCell>
</template>
