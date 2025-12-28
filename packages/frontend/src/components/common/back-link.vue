<template>
  <RouterLink
    :to="to"
    class="text-muted-foreground bg-background hover:text-foreground sticky top-[var(--header-height)] z-[var(--z-navbar)] mb-2 flex items-center gap-1 py-2 text-sm transition-colors"
  >
    <ChevronLeftIcon class="size-4" />

    <slot />
  </RouterLink>
</template>

<script setup lang="ts">
import { ChevronLeftIcon } from 'lucide-vue-next';
import type { RouteLocationRaw } from 'vue-router';
import { RouterLink } from 'vue-router';

defineProps<{
  to: RouteLocationRaw;
}>();
</script>
