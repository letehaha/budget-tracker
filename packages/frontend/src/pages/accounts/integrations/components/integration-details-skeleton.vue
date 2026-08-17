<template>
  <div>
    <div class="flex items-start gap-3">
      <div class="bg-muted size-8 animate-pulse rounded-md" />
      <div class="bg-muted size-7 animate-pulse rounded-md" />
      <div class="flex-1 space-y-2">
        <div class="bg-muted h-6 w-52 animate-pulse rounded" />
        <div class="bg-muted h-3 w-72 max-w-full animate-pulse rounded" />
      </div>
      <div class="bg-muted size-8 animate-pulse rounded-md" />
    </div>

    <Card class="@container/summary mt-4 p-5">
      <div class="flex flex-col gap-6 @2xl/summary:flex-row @2xl/summary:items-center">
        <div class="shrink-0 space-y-2 @2xl/summary:pr-8">
          <div class="bg-muted h-3 w-24 animate-pulse rounded" />
          <div class="bg-muted h-8 w-40 animate-pulse rounded" />
          <div class="bg-muted h-3 w-28 animate-pulse rounded" />
        </div>
        <div class="grid flex-1 grid-cols-2 gap-x-6 gap-y-4 @2xl/summary:grid-cols-4">
          <div v-for="i in 4" :key="i" class="space-y-2">
            <div class="bg-muted h-3 w-20 animate-pulse rounded" />
            <div class="bg-muted h-4 w-16 animate-pulse rounded" />
          </div>
        </div>
      </div>
    </Card>

    <div class="bg-muted mt-6 mb-2 ml-1 h-3 w-40 animate-pulse rounded" />

    <div class="border-border divide-border/60 divide-y overflow-hidden rounded-xl border">
      <div v-for="i in 3" :key="i" class="flex min-h-[52px] items-center gap-4 px-4 py-2">
        <div class="bg-muted h-4 w-40 max-w-[40%] animate-pulse rounded" />
        <div class="bg-muted h-3 w-32 animate-pulse rounded" />
        <div class="bg-muted ml-auto h-4 w-24 animate-pulse rounded" />
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { Card } from '@/components/lib/ui/card';
</script>
