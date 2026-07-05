<script setup lang="ts">
import type { LoanApi } from '@/api/loans';
import { useLoans } from '@/composable/data-queries/loans';
import { partitionLoans } from '@/pages/loans/utils/partition-loans';
import { computed } from 'vue';

import LoansItem from './loans-item.vue';

const { data: loans, isLoading } = useLoans();

// Only still-owing loans surface in the sidebar; paid-off and archived loans stay
// on the Loans page. `partitionLoans` already encodes that active/paid-off/archived split.
const activeLoans = computed<LoanApi[]>(() =>
  [...partitionLoans({ loans: loans.value ?? [] }).active].sort((a, b) => a.name.localeCompare(b.name)),
);
</script>

<template>
  <div class="space-y-0.5">
    <template v-if="isLoading">
      <div class="bg-muted/30 mx-2 h-7 animate-pulse rounded" />
      <div class="bg-muted/30 mx-2 h-7 animate-pulse rounded" />
    </template>
    <template v-else-if="activeLoans.length">
      <LoansItem v-for="loan in activeLoans" :key="loan.id" :loan="loan" />
    </template>
  </div>
</template>
