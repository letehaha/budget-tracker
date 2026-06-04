<template>
  <UiButton
    variant="ghost"
    size="sm"
    type="button"
    :class="[
      'h-auto w-full gap-1 px-0 py-0 text-xs font-medium tracking-wider uppercase hover:bg-transparent',
      align === 'right' ? 'justify-end' : 'justify-start',
      active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
    ]"
    @click="emit('click')"
  >
    <span>{{ label }}</span>
    <component v-if="active" :is="dir === 'asc' ? ArrowUpIcon : ArrowDownIcon" class="size-3" />
  </UiButton>
</template>

<script setup lang="ts">
import { Button as UiButton } from '@/components/lib/ui/button';
import { ArrowDownIcon, ArrowUpIcon } from '@lucide/vue';

withDefaults(
  defineProps<{
    label: string;
    active: boolean;
    dir: 'asc' | 'desc';
    align?: 'left' | 'right';
  }>(),
  { align: 'left' },
);

const emit = defineEmits<{ click: [] }>();
</script>
