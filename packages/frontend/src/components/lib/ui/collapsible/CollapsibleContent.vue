<script setup lang="ts">
import { reactiveOmit } from '@vueuse/core';
import { CollapsibleContent, type CollapsibleContentProps } from 'reka-ui';
import { nextTick } from 'vue';

const props = defineProps<CollapsibleContentProps & { scrollIntoView?: boolean }>();
const contentProps = reactiveOmit(props, 'scrollIntoView');

// Height animates from 0, so the content only has its real size once the open animation ends.
const onAnimationEnd = (e: AnimationEvent) => {
  const el = e.currentTarget as HTMLElement;

  if (!props.scrollIntoView || e.target !== el || el.dataset.state !== 'open') return;

  // Scrolling synchronously inside animationend is a no-op; it works one tick later.
  nextTick(() => {
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
};
</script>

<template>
  <CollapsibleContent
    v-bind="contentProps"
    :class="[
      'overflow-hidden transition-all',
      'data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down',
    ]"
    @animationend="onAnimationEnd"
  >
    <slot />
  </CollapsibleContent>
</template>
