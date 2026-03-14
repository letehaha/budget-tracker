<template>
  <div class="flex flex-col gap-3">
    <!-- Header skeleton: percentage + amount -->
    <div class="flex items-baseline justify-between gap-2">
      <div class="bg-muted h-7 w-20 animate-pulse rounded" />
      <div class="bg-muted h-4 w-24 animate-pulse rounded" />
    </div>
    <!-- Total bar skeleton -->
    <div class="bg-muted h-2 w-full animate-pulse rounded-full" />
    <!-- Account rows skeleton -->
    <div class="flex flex-col gap-2">
      <div v-for="i in 3" :key="i" class="flex flex-col gap-1.5 px-3 py-2">
        <div class="flex items-center justify-between gap-2">
          <div class="bg-muted/60 h-4 w-28 animate-pulse rounded" />
          <div class="bg-muted/60 h-3 w-16 animate-pulse rounded" />
        </div>
        <div class="bg-muted/40 h-1.5 w-full animate-pulse rounded-full" />
      </div>
    </div>
  </div>
</template>
