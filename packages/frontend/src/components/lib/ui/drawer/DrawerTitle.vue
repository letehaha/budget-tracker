<script lang="ts" setup>
import { cn } from '@/lib/utils';
import type { DrawerTitleProps } from 'vaul-vue';
import { DrawerTitle } from 'vaul-vue';
import { type HtmlHTMLAttributes, computed } from 'vue';

const props = defineProps<DrawerTitleProps & { class?: HtmlHTMLAttributes['class'] }>();

const delegatedProps = computed(() => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { class: _, ...delegated } = props;

  return delegated;
});
</script>

<template>
  <DrawerTitle
    v-bind="delegatedProps"
    tabindex="0"
    :class="cn('text-lg font-semibold leading-none tracking-tight', props.class)"
  >
    <slot />
  </DrawerTitle>
</template>
