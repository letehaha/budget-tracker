<template>
  <div class="@container/archived-list">
    <div class="border-border/60 bg-card divide-border/60 divide-y overflow-hidden rounded-xl border">
      <ArchivedLoanListRow v-for="loan in loans" :key="loan.id" :loan="loan" />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { LoanApi } from '@/api/loans';

import ArchivedLoanListRow from './archived-loan-list-row.vue';

defineProps<{ loans: LoanApi[] }>();
</script>
