<script setup lang="ts">
import Card from '@/components/lib/ui/card/Card.vue';
</script>

<template>
  <div class="@container max-w-5xl p-6">
    <!-- Back Button -->
    <div class="mb-6">
      <div class="bg-muted mb-4 h-8 w-32 animate-pulse rounded" />

      <!-- Hero Header -->
      <div class="flex flex-col gap-4 @md:flex-row @md:items-center @md:justify-between">
        <div class="flex items-center gap-4">
          <div class="bg-muted size-12 shrink-0 animate-pulse rounded-xl" />
          <div>
            <div class="bg-muted mb-2 h-7 w-48 animate-pulse rounded" />
            <div class="bg-muted h-4 w-36 animate-pulse rounded" />
          </div>
        </div>
        <div class="bg-muted h-9 w-24 animate-pulse rounded" />
      </div>
    </div>

    <!-- Stats Cards -->
    <div class="mb-6 grid grid-cols-1 gap-3 @3xl:grid-cols-3 @3xl:gap-4">
      <Card v-for="i in 3" :key="i" class="p-4">
        <div class="flex items-center justify-between">
          <div>
            <div class="bg-muted mb-2 h-4 w-16 animate-pulse rounded" />
            <div class="bg-muted h-8 w-24 animate-pulse rounded" />
          </div>
          <div class="bg-muted size-10 animate-pulse rounded-full" />
        </div>
      </Card>
    </div>

    <!-- Transactions Section Header -->
    <div class="mb-4">
      <div class="bg-muted mb-1 h-6 w-28 animate-pulse rounded" />
      <div class="bg-muted h-4 w-40 animate-pulse rounded" />
    </div>

    <!-- Transactions Card Skeleton -->
    <Card class="p-4">
      <div class="border-border/50 mb-4 flex items-center justify-between border-b pb-3">
        <div class="bg-muted h-4 w-40 animate-pulse rounded" />
        <div class="flex gap-2">
          <div class="bg-muted h-8 w-20 animate-pulse rounded" />
          <div class="bg-muted h-8 w-32 animate-pulse rounded" />
        </div>
      </div>
      <div class="space-y-3">
        <div v-for="i in 5" :key="i" class="flex items-center gap-3">
          <div class="bg-muted size-10 animate-pulse rounded-lg" />
          <div class="flex-1">
            <div class="bg-muted mb-1 h-4 w-32 animate-pulse rounded" />
            <div class="bg-muted h-3 w-24 animate-pulse rounded" />
          </div>
          <div class="bg-muted h-5 w-20 animate-pulse rounded" />
        </div>
      </div>
    </Card>
  </div>
</template>
