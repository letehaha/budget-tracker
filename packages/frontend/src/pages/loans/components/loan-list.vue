<template>
  <div class="@container/loans-list">
    <div class="border-border/60 bg-card divide-border/60 divide-y overflow-hidden rounded-xl border">
      <div
        :class="
          cn(
            LOAN_LIST_GRID_COLS,
            'bg-muted/30 text-muted-foreground hidden px-4 py-2.5 text-[10px] font-semibold tracking-[0.14em] uppercase @[56rem]/loans-list:grid',
          )
        "
      >
        <div>{{ $t('loans.list.columns.loan') }}</div>
        <div>{{ $t('loans.list.columns.progress') }}</div>
        <div class="text-right">{{ $t('loans.list.columns.balance') }}</div>
        <div class="text-right">{{ $t('loans.list.columns.apr') }}</div>
        <div class="text-right">{{ $t('loans.list.columns.monthly') }}</div>
        <div class="text-right">{{ $t('loans.list.columns.payoff') }}</div>
        <div class="text-right">{{ $t('loans.list.columns.interestLeft') }}</div>
        <div />
      </div>

      <LoanListRow v-for="loan in loans" :key="loan.id" :loan="loan" />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { LoanApi } from '@/api/loans';
import { cn } from '@/lib/utils';

import { LOAN_LIST_GRID_COLS } from './loan-list-grid';
import LoanListRow from './loan-list-row.vue';

defineProps<{ loans: LoanApi[] }>();
</script>
