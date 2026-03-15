<template>
  <div>
    <!-- Header: back button + title -->
    <div class="mb-6 flex items-center gap-4">
      <div class="bg-muted size-10 animate-pulse rounded-md" />
      <div class="bg-muted h-7 w-48 animate-pulse rounded" />
    </div>

    <!-- Connection Details Card -->
    <Card class="mb-6 p-6">
      <div class="mb-4">
        <div class="bg-muted h-5 w-44 animate-pulse rounded" />
      </div>
      <div class="grid gap-4 md:grid-cols-2">
        <div v-for="i in 4" :key="i">
          <div class="bg-muted mb-2 h-4 w-28 animate-pulse rounded" />
          <div class="bg-muted h-5 animate-pulse rounded" :class="i === 3 ? 'w-52' : 'w-32'" />
        </div>
      </div>
    </Card>

    <!-- Connected Accounts Card -->
    <Card class="mb-6 p-6">
      <div class="mb-4 flex items-center justify-between">
        <div class="bg-muted h-5 w-44 animate-pulse rounded" />
        <div class="bg-muted hidden h-8 w-40 animate-pulse rounded sm:block" />
      </div>
      <div class="space-y-3">
        <div v-for="i in 2" :key="i" class="flex items-center justify-between gap-4 rounded-lg border p-4">
          <div class="flex-1">
            <div class="bg-muted mb-2 h-4 w-36 animate-pulse rounded" />
            <div class="bg-muted mb-1 h-3 w-20 animate-pulse rounded" />
            <div class="bg-muted h-3 w-44 animate-pulse rounded" />
          </div>
          <div class="bg-muted h-5 w-24 animate-pulse rounded" />
        </div>
      </div>
    </Card>

    <!-- Actions Card -->
    <Card class="p-6">
      <div class="mb-4">
        <div class="bg-muted h-5 w-20 animate-pulse rounded" />
      </div>
      <div class="bg-muted h-9 w-28 animate-pulse rounded" />
    </Card>
  </div>
</template>

<script lang="ts" setup>
import { Card } from '@/components/lib/ui/card';
</script>
