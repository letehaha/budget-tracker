<template>
  <Card>
    <div v-if="isLoading" class="text-muted-foreground text-center">Loading portfolio summary...</div>
    <div v-else-if="error" class="text-destructive text-center">Failed to load portfolio summary.</div>
    <div v-else-if="summary">
      <!-- Main Portfolio Value - Yahoo Finance Style -->
      <CardHeader class="flex flex-row items-baseline gap-3">
        <h2 class="text-3xl font-light">
          {{ formatCurrency(Number(summary.totalCurrentValue), summary.currencyCode) }}
        </h2>

        <div :class="getGainColorClass(getTotalGainPercent())" class="flex items-baseline gap-1">
          <span class="text-lg font-medium">
            {{ getTotalGainValue() >= 0 ? '+' : '' }}{{ formatCurrency(getTotalGainValue(), summary.currencyCode) }}
          </span>
          <span class="text-sm">
            ({{ getTotalGainPercent() >= 0 ? '+' : '' }}{{ getTotalGainPercent().toFixed(2) }}%)
          </span>
        </div>
      </CardHeader>

      <!-- Key Metrics Row -->
      <CardContent class="flex gap-6 border-t pt-6!">
        <div class="text-center">
          <p class="text-muted-foreground text-xs tracking-wide uppercase">COST BASIS</p>
          <p class="mt-1 text-sm font-medium">
            {{ formatCurrency(Number(summary.totalCostBasis), summary.currencyCode) }}
          </p>
        </div>

        <div class="text-center">
          <p class="text-muted-foreground text-xs tracking-wide uppercase">UNREALIZED</p>
          <div :class="getGainColorClass(Number(summary.unrealizedGainPercent))" class="mt-1">
            <p class="text-sm font-medium">
              {{ Number(summary.unrealizedGainValue) >= 0 ? '+' : ''
              }}{{ formatCurrency(Number(summary.unrealizedGainValue), summary.currencyCode) }}
            </p>
            <p class="text-xs">
              ({{ Number(summary.unrealizedGainPercent) >= 0 ? '+' : ''
              }}{{ Number(summary.unrealizedGainPercent).toFixed(2) }}%)
            </p>
          </div>
        </div>

        <div class="text-center">
          <p class="text-muted-foreground text-xs tracking-wide uppercase">REALIZED</p>
          <div :class="getGainColorClass(Number(summary.realizedGainPercent))" class="mt-1">
            <p class="text-sm font-medium">
              {{ Number(summary.realizedGainValue) >= 0 ? '+' : ''
              }}{{ formatCurrency(Number(summary.realizedGainValue), summary.currencyCode) }}
            </p>
            <p class="text-xs">
              ({{ Number(summary.realizedGainPercent) >= 0 ? '+' : ''
              }}{{ Number(summary.realizedGainPercent).toFixed(2) }}%)
            </p>
          </div>
        </div>

        <div class="text-center">
          <p class="text-muted-foreground text-xs tracking-wide uppercase">TOTAL RETURN</p>
          <div :class="getGainColorClass(getTotalGainPercent())" class="mt-1">
            <p class="text-sm font-medium">
              {{ getTotalGainValue() >= 0 ? '+' : '' }}{{ formatCurrency(getTotalGainValue(), summary.currencyCode) }}
            </p>
            <p class="text-xs">({{ getTotalGainPercent() >= 0 ? '+' : '' }}{{ getTotalGainPercent().toFixed(2) }}%)</p>
          </div>
        </div>
      </CardContent>
    </div>
  </Card>
</template>

<script setup lang="ts">
import { Card, CardContent, CardHeader } from '@/components/lib/ui/card';
import { usePortfolioSummary } from '@/composable/data-queries/portfolio-summary';
import { useFormatCurrency } from '@/composable/formatters';
import { useCurrenciesStore } from '@/stores/currencies';
import { storeToRefs } from 'pinia';
import { toRef } from 'vue';

const props = defineProps<{ portfolioId: number }>();
const portfolioId = toRef(props, 'portfolioId');

const { data: summary, isLoading, error } = usePortfolioSummary(portfolioId);

const { formatAmountByCurrencyCode } = useFormatCurrency();
const { currencies } = storeToRefs(useCurrenciesStore());

const formatCurrency = (amount: number, currencyCode: string) => {
  const userCurrency = currencies.value.find((c) => c.currency.code === currencyCode.toUpperCase());
  if (!userCurrency) {
    return amount.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
  return formatAmountByCurrencyCode(amount, userCurrency.currencyCode);
};

const getGainColorClass = (gainPercent: number) => {
  if (gainPercent > 0) return 'text-green-600';
  if (gainPercent < 0) return 'text-red-600';
  return 'text-gray-600';
};

const getTotalGainValue = () => {
  if (!summary.value) return 0;
  return Number(summary.value.unrealizedGainValue) + Number(summary.value.realizedGainValue);
};

const getTotalGainPercent = () => {
  if (!summary.value || Number(summary.value.totalCostBasis) === 0) return 0;
  return (getTotalGainValue() / Number(summary.value.totalCostBasis)) * 100;
};
</script>
