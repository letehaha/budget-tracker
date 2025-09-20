<script lang="ts" setup>
import { cn } from '@/lib/utils';
import type { DialogOverlayProps } from 'radix-vue';
import { DrawerOverlay } from 'vaul-vue';
import { type HtmlHTMLAttributes, computed } from 'vue';

const props = defineProps<DialogOverlayProps & { class?: HtmlHTMLAttributes['class'] }>();

const delegatedProps = computed(() => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { class: _, ...delegated } = props;

  return delegated;
});
</script>

<template>
  <DrawerOverlay v-bind="delegatedProps" :class="cn('fixed inset-0 z-(--z-dialog) bg-black/80', props.class)" />
</template>
