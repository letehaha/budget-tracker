<script setup lang="ts">
import { useFormatCurrency } from '@/composable';

defineProps<{
  income: number;
  expense: number;
  balance: number;
}>();

const { formatBaseCurrency } = useFormatCurrency();
</script>

<template>
  <div class="border-border/50 mt-auto grid grid-cols-3 gap-2 border-t pt-3">
    <div>
      <div class="text-muted-foreground text-[10px] tracking-wider uppercase">
        {{ $t('budgets.list.income') }}
      </div>
      <div class="text-success-text text-sm font-medium tabular-nums">
        {{ formatBaseCurrency(income) }}
      </div>
    </div>
    <div>
      <div class="text-muted-foreground text-[10px] tracking-wider uppercase">
        {{ $t('budgets.list.expenses') }}
      </div>
      <div class="text-app-expense-color text-sm font-medium tabular-nums">
        {{ formatBaseCurrency(expense) }}
      </div>
    </div>
    <div>
      <div class="text-muted-foreground text-[10px] tracking-wider uppercase">
        {{ $t('budgets.list.net') }}
      </div>
      <div
        class="text-sm font-medium tabular-nums"
        :class="balance >= 0 ? 'text-success-text' : 'text-app-expense-color'"
      >
        {{ formatBaseCurrency(balance) }}
      </div>
    </div>
  </div>
</template>
