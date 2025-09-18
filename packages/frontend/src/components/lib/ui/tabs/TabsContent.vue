<script setup lang="ts">
import { cn } from '@/lib/utils';
import { TabsContent, type TabsContentProps } from 'radix-vue';

const props = defineProps<TabsContentProps & { class?: string }>();
</script>

<template>
  <TabsContent
    :class="
      cn(
        'ring-offset-background focus-visible:ring-ring mt-2 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-offset-2',
        props.class,
      )
    "
    v-bind="props"
  >
    <slot />
  </TabsContent>
</template>
