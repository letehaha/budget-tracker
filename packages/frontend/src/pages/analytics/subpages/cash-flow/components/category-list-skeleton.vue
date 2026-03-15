<template>
  <div class="space-y-3">
    <div v-for="i in itemCount" :key="i" class="flex animate-pulse items-center gap-3">
      <span class="bg-muted size-3 shrink-0 rounded-full"></span>
      <div class="min-w-0 flex-1">
        <div class="flex items-center justify-between gap-2">
          <div class="bg-muted h-4 w-24 rounded"></div>
          <div class="flex items-center gap-2">
            <div class="bg-muted h-4 w-16 rounded"></div>
            <div class="bg-muted h-4 w-10 rounded"></div>
          </div>
        </div>
        <div class="bg-muted mt-1 h-1.5 w-full rounded-full"></div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    itemCount?: number;
  }>(),
  {
    itemCount: 5,
  },
);
</script>
