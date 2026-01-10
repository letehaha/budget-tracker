<template>
  <div class="border-border bg-card animate-pulse rounded-lg border p-4">
    <div class="flex h-80 flex-col">
      <!-- Y-axis labels skeleton -->
      <div class="flex h-full gap-4">
        <div class="flex flex-col justify-between py-4">
          <div class="bg-muted h-3 w-8 rounded"></div>
          <div class="bg-muted h-3 w-10 rounded"></div>
          <div class="bg-muted h-3 w-8 rounded"></div>
          <div class="bg-muted h-3 w-10 rounded"></div>
          <div class="bg-muted h-3 w-6 rounded"></div>
        </div>
        <!-- Chart area skeleton -->
        <div class="bg-muted/30 flex-1 rounded"></div>
      </div>
      <!-- X-axis labels skeleton -->
      <div class="mt-2 flex justify-between px-12">
        <div class="bg-muted h-3 w-8 rounded"></div>
        <div class="bg-muted h-3 w-8 rounded"></div>
        <div class="bg-muted h-3 w-8 rounded"></div>
        <div class="bg-muted h-3 w-8 rounded"></div>
      </div>
      <!-- Legend skeleton -->
      <div v-if="showLegend" class="mt-4 flex justify-center gap-6">
        <div class="flex items-center gap-2">
          <div class="bg-muted h-1 w-4 rounded"></div>
          <div class="bg-muted h-3 w-20 rounded"></div>
        </div>
        <div class="flex items-center gap-2">
          <div class="bg-muted h-1 w-4 rounded"></div>
          <div class="bg-muted h-3 w-24 rounded"></div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    showLegend?: boolean;
  }>(),
  {
    showLegend: true,
  },
);
</script>
