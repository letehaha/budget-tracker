<template>
  <Card class="flex h-full flex-col">
    <CardHeader class="sm:py-3">
      <div class="flex items-center justify-between gap-1">
        <div class="bg-muted h-5 w-32 animate-pulse rounded" />
      </div>
    </CardHeader>

    <CardContent class="flex min-h-0 flex-1 flex-col overflow-hidden">
      <slot>
        <LoadingState />
      </slot>
    </CardContent>
  </Card>
</template>

<script lang="ts" setup>
import { Card, CardContent, CardHeader } from '@/components/lib/ui/card';

import LoadingState from './loading-state.vue';
</script>
