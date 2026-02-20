<script setup lang="ts">
import { Card } from '@/components/lib/ui/card';

withDefaults(
  defineProps<{
    count?: number;
    inline?: boolean;
  }>(),
  {
    count: 3,
    inline: false,
  },
);
</script>

<template>
  <!-- When inline, render cards directly (parent provides the grid) -->
  <template v-if="inline">
    <Card v-for="i in count" :key="`skeleton-${i}`" class="flex flex-col overflow-hidden">
      <!-- Status banner skeleton -->
      <div class="bg-muted/50 flex items-center justify-center py-1.5">
        <div class="bg-muted h-3.5 w-20 animate-pulse rounded" />
      </div>

      <div class="flex flex-1 flex-col p-4">
        <!-- Header skeleton -->
        <div class="mb-3 flex items-center gap-3">
          <div class="bg-muted size-10 shrink-0 animate-pulse rounded-lg" />
          <div class="flex-1">
            <div class="bg-muted mb-2 h-5 w-28 animate-pulse rounded" />
            <div class="bg-muted h-3.5 w-20 animate-pulse rounded" />
          </div>
        </div>

        <!-- Date range skeleton -->
        <div class="mb-3 flex items-center gap-1.5">
          <div class="bg-muted size-3.5 animate-pulse rounded" />
          <div class="bg-muted h-3 w-36 animate-pulse rounded" />
        </div>

        <!-- Stats skeleton -->
        <div class="border-border/50 mt-auto grid grid-cols-3 gap-2 border-t pt-3">
          <div v-for="j in 3" :key="j">
            <div class="bg-muted mb-1 h-3 w-12 animate-pulse rounded" />
            <div class="bg-muted h-5 w-16 animate-pulse rounded" />
          </div>
        </div>
      </div>
    </Card>
  </template>

  <!-- When not inline, wrap in a grid (initial full-page load) -->
  <div v-else class="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
    <Card v-for="i in count" :key="`skeleton-${i}`" class="flex flex-col overflow-hidden">
      <!-- Status banner skeleton -->
      <div class="bg-muted/50 flex items-center justify-center py-1.5">
        <div class="bg-muted h-3.5 w-20 animate-pulse rounded" />
      </div>

      <div class="flex flex-1 flex-col p-4">
        <!-- Header skeleton -->
        <div class="mb-3 flex items-center gap-3">
          <div class="bg-muted size-10 shrink-0 animate-pulse rounded-lg" />
          <div class="flex-1">
            <div class="bg-muted mb-2 h-5 w-28 animate-pulse rounded" />
            <div class="bg-muted h-3.5 w-20 animate-pulse rounded" />
          </div>
        </div>

        <!-- Date range skeleton -->
        <div class="mb-3 flex items-center gap-1.5">
          <div class="bg-muted size-3.5 animate-pulse rounded" />
          <div class="bg-muted h-3 w-36 animate-pulse rounded" />
        </div>

        <!-- Stats skeleton -->
        <div class="border-border/50 mt-auto grid grid-cols-3 gap-2 border-t pt-3">
          <div v-for="j in 3" :key="j">
            <div class="bg-muted mb-1 h-3 w-12 animate-pulse rounded" />
            <div class="bg-muted h-5 w-16 animate-pulse rounded" />
          </div>
        </div>
      </div>
    </Card>
  </div>
</template>
