<script setup lang="ts">
import ResponsiveTooltip from '@/components/common/responsive-tooltip.vue';
import { InfoIcon } from '@lucide/vue';

defineProps<{
  content: string;
}>();

const HINT_CONTENT_CLASS = 'w-fit max-w-[min(450px,calc(100vw-2rem))] text-pretty';
</script>

<template>
  <ResponsiveTooltip :delay-duration="100" :content="content" :content-class-name="HINT_CONTENT_CLASS">
    <InfoIcon class="text-muted-foreground size-5 cursor-help" @click.prevent.stop />
  </ResponsiveTooltip>
</template>
