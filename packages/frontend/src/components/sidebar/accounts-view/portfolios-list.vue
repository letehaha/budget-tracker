<script setup lang="ts">
import { usePortfolios } from '@/composable/data-queries/portfolios';
import { PortfolioModel } from '@bt/shared/types/investments';
import { computed } from 'vue';

import PortfolioItem from './portfolios-item.vue';

const { data: portfolios, isLoading } = usePortfolios();

const visiblePortfolios = computed<PortfolioModel[]>(() =>
  (portfolios.value ?? [])
    .filter((p) => !p.deletedAt)
    .sort((a, b) => +b.isEnabled - +a.isEnabled || a.name.localeCompare(b.name)),
);
</script>

<template>
  <div class="space-y-0.5">
    <template v-if="isLoading">
      <div class="bg-muted/30 mx-2 h-7 animate-pulse rounded" />
      <div class="bg-muted/30 mx-2 h-7 animate-pulse rounded" />
    </template>
    <template v-else-if="visiblePortfolios.length">
      <PortfolioItem v-for="portfolio in visiblePortfolios" :key="portfolio.id" :portfolio="portfolio" />
    </template>
    <template v-else>
      <p class="text-muted-foreground px-3 py-1 text-xs">
        {{ $t('sidebar.accountsView.noPortfolios') }}
      </p>
    </template>
  </div>
</template>
