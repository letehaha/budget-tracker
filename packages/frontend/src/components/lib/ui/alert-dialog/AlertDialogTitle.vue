<script setup lang="ts">
import { cn } from '@/lib/utils';
import { AlertDialogTitle, type AlertDialogTitleProps } from 'reka-ui';

const props = defineProps<AlertDialogTitleProps & { class?: string }>();
</script>

<template>
  <AlertDialogTitle :as-child="props.asChild" :class="cn('text-foreground text-lg font-semibold', props.class)">
    <slot />
  </AlertDialogTitle>
</template>
