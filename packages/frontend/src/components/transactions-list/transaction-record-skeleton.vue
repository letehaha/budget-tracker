<template>
  <div class="grid w-full grid-cols-[minmax(0,1fr)_max-content] items-center gap-2 rounded-md px-2 py-1">
    <!-- Left side: Category circle + text -->
    <div class="flex items-center gap-2 overflow-hidden">
      <!-- Category circle skeleton -->
      <div class="bg-muted size-6 shrink-0 animate-pulse rounded-full" />

      <div v-if="compact" class="bg-muted h-4 w-32 animate-pulse rounded" />
      <div v-else class="w-full">
        <!-- Category name skeleton -->
        <div class="bg-muted mb-1 h-4 w-24 animate-pulse rounded" />
        <!-- Note skeleton -->
        <div class="bg-muted h-3.5 w-32 animate-pulse rounded opacity-60" />
      </div>
    </div>

    <!-- Right side: Amount + date -->
    <div v-if="compact" class="bg-muted h-4 w-24 animate-pulse rounded" />
    <div v-else class="flex flex-col items-end">
      <!-- Amount skeleton -->
      <div class="bg-muted mb-1 h-4 w-20 animate-pulse rounded" />
      <!-- Date skeleton -->
      <div class="bg-muted h-3.5 w-16 animate-pulse rounded" />
    </div>
  </div>
</template>

<script lang="ts" setup>
withDefaults(defineProps<{ compact?: boolean }>(), { compact: false });
</script>
