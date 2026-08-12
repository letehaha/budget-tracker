<template>
  <p class="text-primary-text mt-1 flex items-center gap-1 px-1 text-xs">
    <CheckIcon class="size-3 shrink-0" />
    <slot />
  </p>
</template>

<script setup lang="ts">
import { CheckIcon } from '@lucide/vue';
</script>
