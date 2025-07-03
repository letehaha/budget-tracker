<template>
  <div class="p-6">
    <div class="mb-6 flex items-center justify-between">
      <div class="flex items-center gap-4">
        <router-link :to="{ name: ROUTES_NAMES.investments }" class="text-muted-foreground hover:text-foreground">
          <ChevronLeftIcon class="h-5 w-5" />
        </router-link>
        <h1 class="text-2xl tracking-wider">Portfolio Details</h1>
      </div>
    </div>

    <div class="py-12 text-center">
      <div class="text-muted-foreground mb-4">
        <FileTextIcon class="mx-auto h-12 w-12" />
      </div>
      <h3 class="mb-2 text-lg font-medium">Portfolio Detail Page</h3>
      <p class="text-muted-foreground mb-4">
        This page will show portfolio details, holdings, and performance metrics.
      </p>
      <p class="text-muted-foreground text-sm">Portfolio ID: {{ $route.params.portfolioId }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ROUTES_NAMES } from '@/routes/constants';
import { ChevronLeftIcon, FileTextIcon } from 'lucide-vue-next';
</script>
