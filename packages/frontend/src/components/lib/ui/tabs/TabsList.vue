<script setup lang="ts">
import { cn } from '@/lib/utils';
import { TabsList, type TabsListProps } from 'radix-vue';

const props = defineProps<TabsListProps & { class?: string }>();
</script>

<template>
  <TabsList
    v-bind="props"
    :class="
      cn('inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground', props.class)
    "
  >
    <slot />
  </TabsList>
</template>
