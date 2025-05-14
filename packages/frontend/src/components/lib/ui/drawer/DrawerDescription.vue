<script lang="ts" setup>
import { cn } from '@/lib/utils';
import type { DrawerDescriptionProps } from 'vaul-vue';
import { DrawerDescription } from 'vaul-vue';
import { type HtmlHTMLAttributes, computed } from 'vue';

const props = defineProps<DrawerDescriptionProps & { class?: HtmlHTMLAttributes['class'] }>();

const delegatedProps = computed(() => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { class: _, ...delegated } = props;

  return delegated;
});
</script>

<template>
  <DrawerDescription v-bind="delegatedProps" tabindex="0" :class="cn('text-muted-foreground text-sm', props.class)">
    <slot />
  </DrawerDescription>
</template>
