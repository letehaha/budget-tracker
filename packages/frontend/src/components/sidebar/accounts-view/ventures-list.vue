<script setup lang="ts">
import { useVentureDeals } from '@/composable/data-queries/venture/deals';
import { VentureDealModel } from '@bt/shared/types/venture';
import { computed } from 'vue';

import VenturesItem from './ventures-item.vue';

const { data: deals, isLoading } = useVentureDeals();

const visibleDeals = computed<VentureDealModel[]>(() =>
  [...(deals.value?.data ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
);
</script>

<template>
  <div class="space-y-0.5">
    <template v-if="isLoading">
      <div class="bg-muted/30 mx-2 h-7 animate-pulse rounded" />
      <div class="bg-muted/30 mx-2 h-7 animate-pulse rounded" />
    </template>
    <template v-else-if="visibleDeals.length">
      <VenturesItem v-for="deal in visibleDeals" :key="deal.id" :deal="deal" />
    </template>
  </div>
</template>
