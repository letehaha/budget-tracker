<template>
  <div class="bg-muted/40 space-y-1 rounded-lg p-3">
    <p class="text-muted-foreground text-xs font-medium tracking-wide uppercase">
      {{ label }}
    </p>
    <p class="truncate text-sm font-semibold">
      {{ performer.symbol || performer.name || $t('portfolioExtendedStats.unknownSecurity') }}
    </p>
    <div :class="toneClass" class="space-y-0.5">
      <p class="text-base font-semibold">
        {{ formatPercentSigned(performer.returnPercent) }}
      </p>
      <p class="text-xs">
        {{ formatMoneySigned(performer.returnValue) }}
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { PortfolioPerformer } from '@bt/shared/types/investments/portfolio-extended-stats.model';
import { useFormatCurrency } from '@/composable/formatters';
import { useCurrenciesStore } from '@/stores/currencies';
import { storeToRefs } from 'pinia';
import { computed } from 'vue';

const props = defineProps<{
  label: string;
  performer: PortfolioPerformer;
  currencyCode: string;
  tone: 'positive' | 'negative';
}>();

const { formatAmountByCurrencyCode } = useFormatCurrency();
const { currencies } = storeToRefs(useCurrenciesStore());

const formatMoneySigned = (decimalString: string) => {
  const amount = parseFloat(decimalString);
  const sign = amount > 0 ? '+' : '';
  const userCurrency = currencies.value.find((c) => c.currency?.code === props.currencyCode.toUpperCase());
  const formatted = userCurrency
    ? formatAmountByCurrencyCode(Math.abs(amount), userCurrency.currencyCode)
    : Math.abs(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${sign}${amount < 0 ? '-' : ''}${formatted}`;
};

const formatPercentSigned = (decimalString: string) => {
  const n = parseFloat(decimalString);
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(2)}%`;
};

const toneClass = computed(() => {
  // Based on the actual signs: a "best" performer with negative gain still gets the negative tone.
  const v = parseFloat(props.performer.returnValue);
  if (v > 0) return 'text-app-income-color';
  if (v < 0) return 'text-app-expense-color';
  return '';
});
</script>
