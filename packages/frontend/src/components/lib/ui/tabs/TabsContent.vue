<script setup lang="ts">
import { cn } from '@/lib/utils';
import { TabsContent, type TabsContentProps } from 'radix-vue';

const props = defineProps<TabsContentProps & { class?: string }>();
</script>

<template>
  <TabsContent
    :class="
      cn(
        'mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        props.class,
      )
    "
    v-bind="props"
  >
    <slot />
  </TabsContent>
</template>
