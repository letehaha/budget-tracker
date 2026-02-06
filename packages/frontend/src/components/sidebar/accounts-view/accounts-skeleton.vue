<script setup lang="ts">
/**
 * Skeleton placeholder shown while accounts and account groups are loading.
 * Mimics the structure of accounts list to prevent layout shift.
 */
</script>

<template>
  <div class="space-y-2 px-2">
    <!-- Skeleton account group -->
    <div class="space-y-1">
      <div class="bg-muted/50 h-8 w-32 animate-pulse rounded" />
      <div class="space-y-1 pl-4">
        <div class="bg-muted/30 h-7 animate-pulse rounded" />
        <div class="bg-muted/30 h-7 animate-pulse rounded" />
      </div>
    </div>
    <!-- Skeleton ungrouped accounts -->
    <div class="space-y-1 pt-2">
      <div class="bg-muted/30 h-7 animate-pulse rounded" />
      <div class="bg-muted/30 h-7 animate-pulse rounded" />
      <div class="bg-muted/30 h-7 animate-pulse rounded" />
    </div>
  </div>
</template>
