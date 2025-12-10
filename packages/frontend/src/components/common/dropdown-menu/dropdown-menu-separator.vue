<script setup lang="ts">
import { cn } from '@/lib/utils';
import { DropdownMenuSeparator, type DropdownMenuSeparatorProps } from 'reka-ui';

const props = defineProps<DropdownMenuSeparatorProps>();
</script>

<template>
  <DropdownMenuSeparator :class="cn('bg-muted -mx-1 my-1 h-px', $attrs.class ?? '')" v-bind="props" />
</template>
