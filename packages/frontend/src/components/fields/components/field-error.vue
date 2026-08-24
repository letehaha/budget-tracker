<template>
  <p v-if="errorMessage" :class="cn('text-destructive-text mt-1 ml-2 text-xs', attrs.class as string)">
    {{ errorMessage }}
  </p>
</template>

<script lang="ts" setup>
import { cn } from '@/lib/utils';
import { useAttrs } from 'vue';

const attrs = useAttrs();

defineProps<{
  errorMessage?: string | null;
}>();
</script>
