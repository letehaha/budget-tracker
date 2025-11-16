<template>
  <Collapsible v-model:open="isOpen" class="bg-card rounded-md">
    <CollapsibleTrigger
      class="hover:bg-accent xs:py-4 flex w-full items-center justify-between rounded-t-md border px-4 py-2"
    >
      <slot name="trigger-content" />

      <ChevronDownIcon :class="cn('size-5 transition-transform duration-200', isOpen && 'rotate-180')" />
    </CollapsibleTrigger>

    <CollapsibleContent class="xs:px-4 mt-3 pb-4">
      <slot name="content" />
    </CollapsibleContent>
  </Collapsible>
</template>

<script lang="ts" setup>
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/lib/ui/collapsible';
import { cn } from '@/lib/utils';
import { ChevronDownIcon } from 'lucide-vue-next';
import { ref } from 'vue';

const props = defineProps<{ defaultOpen?: boolean }>();

const isOpen = ref(props.defaultOpen !== undefined ? props.defaultOpen : true);
</script>
