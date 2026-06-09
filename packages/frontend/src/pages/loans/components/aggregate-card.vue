<template>
  <Card class="@container/loans-aggregate">
    <CardHeader class="pb-2">
      <div class="text-muted-foreground text-sm font-medium">
        {{ $t('loans.aggregate.title') }}
      </div>
    </CardHeader>
    <CardContent class="grid grid-cols-1 gap-4 @sm/loans-aggregate:grid-cols-2">
      <div>
        <div class="text-app-expense-color text-3xl font-semibold tracking-tight">
          {{ formatBaseCurrency(totalLiabilities) }}
        </div>
        <div class="text-muted-foreground mt-1 text-xs">
          {{ $t('loans.aggregate.totalOwed') }}
        </div>
      </div>
      <div>
        <div class="text-3xl font-semibold tracking-tight">{{ count }}</div>
        <div class="text-muted-foreground mt-1 text-xs">
          {{ $t('loans.aggregate.count', count) }}
        </div>
      </div>
    </CardContent>
  </Card>
</template>

<script setup lang="ts">
import { Card, CardContent, CardHeader } from '@/components/lib/ui/card';
import { useFormatCurrency } from '@/composable/formatters';

defineProps<{
  totalLiabilities: number;
  count: number;
}>();

const { formatBaseCurrency } = useFormatCurrency();
</script>
