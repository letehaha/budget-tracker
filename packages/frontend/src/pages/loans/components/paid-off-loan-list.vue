<template>
  <div class="@container/paid-off-list">
    <div class="border-border/60 bg-card divide-border/60 divide-y overflow-hidden rounded-xl border">
      <PaidOffLoanListRow v-for="loan in loans" :key="loan.id" :loan="loan" />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { LoanApi } from '@/api/loans';

import PaidOffLoanListRow from './paid-off-loan-list-row.vue';

defineProps<{ loans: LoanApi[] }>();
</script>
