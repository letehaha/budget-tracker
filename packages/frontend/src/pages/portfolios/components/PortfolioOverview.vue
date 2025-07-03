<template>
  <Card>
    <CardHeader>
      <CardTitle>Overview</CardTitle>
    </CardHeader>
    <CardContent>
      <div class="grid gap-2">
        <div class="flex items-center justify-between">
          <span class="text-muted-foreground">Name</span>
          <span>{{ portfolio.name }}</span>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-muted-foreground">Type</span>
          <span class="capitalize">{{ portfolio.portfolioType.replace('_', ' ') }}</span>
        </div>
        <div v-if="portfolio.description" class="flex flex-col gap-1">
          <span class="text-muted-foreground">Description</span>
          <p class="text-sm">{{ portfolio.description }}</p>
        </div>
      </div>
    </CardContent>
  </Card>
</template>

<script setup lang="ts">
import { Card, CardContent, CardHeader, CardTitle } from '@/components/lib/ui/card';
import type { PortfolioModel } from '@bt/shared/types/investments';

defineProps<{
  portfolio: PortfolioModel;
}>();
</script>
