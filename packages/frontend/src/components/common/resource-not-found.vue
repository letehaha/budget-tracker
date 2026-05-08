<template>
  <div
    class="flex min-h-80 flex-col items-center justify-center rounded-lg border border-dashed p-6 text-center md:p-12"
  >
    <div class="bg-muted mb-4 flex size-16 items-center justify-center rounded-full">
      <slot name="icon">
        <SearchXIcon class="text-muted-foreground size-8" />
      </slot>
    </div>
    <h2 class="mb-2 text-xl font-semibold tracking-wide">{{ title }}</h2>
    <p v-if="description" class="text-muted-foreground mb-6 max-w-md">{{ description }}</p>
    <RouterLink :to="linkTo">
      <UiButton variant="secondary">
        {{ linkLabel }}
      </UiButton>
    </RouterLink>
  </div>
</template>

<script setup lang="ts">
import UiButton from '@/components/lib/ui/button/Button.vue';
import { SearchXIcon } from 'lucide-vue-next';
import type { RouteLocationRaw } from 'vue-router';
import { RouterLink } from 'vue-router';

defineProps<{
  title: string;
  description?: string;
  linkLabel: string;
  linkTo: RouteLocationRaw;
}>();
</script>
