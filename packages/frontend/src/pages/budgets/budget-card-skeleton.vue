<script setup lang="ts">
import { Card } from '@/components/lib/ui/card';

withDefaults(
  defineProps<{
    count?: number;
  }>(),
  {
    count: 3,
  },
);
</script>

<template>
  <div class="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
    <Card v-for="i in count" :key="i" class="p-4">
      <!-- Header skeleton -->
      <div class="mb-4 flex items-center gap-3">
        <div class="bg-muted size-10 animate-pulse rounded-lg" />
        <div class="flex-1">
          <div class="bg-muted mb-2 h-5 w-32 animate-pulse rounded" />
          <div class="bg-muted h-4 w-24 animate-pulse rounded" />
        </div>
      </div>
      <!-- Stats skeleton -->
      <div class="border-border/50 grid grid-cols-3 gap-2 border-t pt-3">
        <div v-for="j in 3" :key="j">
          <div class="bg-muted mb-1 h-3 w-12 animate-pulse rounded" />
          <div class="bg-muted h-5 w-16 animate-pulse rounded" />
        </div>
      </div>
    </Card>
  </div>
</template>
