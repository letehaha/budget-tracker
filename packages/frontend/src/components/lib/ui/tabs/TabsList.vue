<script setup lang="ts">
import { cn } from '@/lib/utils';
import { TabsIndicator, TabsList, type TabsListProps } from 'reka-ui';
import { computed, provide } from 'vue';

import { TabsVariantKey, type TabsVariant } from './shared';

const props = defineProps<TabsListProps & { class?: string; variant?: TabsVariant }>();

const variant = computed<TabsVariant>(() => props.variant ?? 'default');
provide(TabsVariantKey, variant);
</script>

<template>
  <TabsList
    v-bind="props"
    :class="
      cn(
        variant === 'underline'
          ? 'border-border no-scrollbar relative flex w-full items-center gap-4 overflow-x-auto border-b'
          : 'bg-muted text-muted-foreground inline-flex h-10 items-center justify-center rounded-md p-1',
        props.class,
      )
    "
  >
    <slot />
    <TabsIndicator
      v-if="variant === 'underline'"
      class="bg-primary pointer-events-none absolute -bottom-px left-0 h-0.5 transition-[width,transform] duration-200 ease-out"
      :style="{
        width: 'var(--reka-tabs-indicator-size)',
        transform: 'translateX(var(--reka-tabs-indicator-position))',
      }"
    />
  </TabsList>
</template>
