<template>
  <Card class="@container/loan-projection">
    <CardHeader class="pb-3">
      <div class="text-base font-semibold">{{ $t('loans.detail.projection.title') }}</div>
    </CardHeader>
    <CardContent class="space-y-5">
      <div>
        <div class="mb-1.5 flex items-center justify-between text-xs">
          <span class="text-muted-foreground">{{ $t('loans.detail.projection.paidLabel') }}</span>
          <span class="font-medium">{{ paidPercentDisplay }}</span>
        </div>
        <div class="bg-muted h-2 w-full overflow-hidden rounded-full">
          <div
            class="bg-app-income-color h-full rounded-full transition-[width] duration-300"
            :style="{ width: `${progressBarWidth}%` }"
          />
        </div>
        <div class="text-muted-foreground mt-1.5 text-xs">
          {{ $t('loans.detail.projection.paidOfOriginal', { paid: paidDisplay, original: originalDisplay }) }}
        </div>
      </div>

      <div
        v-if="loan.projection.warning"
        class="text-app-expense-color bg-app-expense-color/10 rounded px-3 py-2 text-xs"
      >
        {{ $t(`loans.warnings.${loan.projection.warning}`) }}
      </div>

      <div class="grid grid-cols-1 gap-4 text-sm @sm/loan-projection:grid-cols-2">
        <div>
          <div class="text-muted-foreground text-xs">{{ $t('loans.detail.projection.payoffDate') }}</div>
          <div class="mt-0.5 font-medium">{{ payoffDateDisplay }}</div>
        </div>
        <div>
          <div class="text-muted-foreground text-xs">{{ $t('loans.detail.projection.monthsRemaining') }}</div>
          <div class="mt-0.5 font-medium">{{ monthsRemainingDisplay }}</div>
        </div>
        <div>
          <div class="text-muted-foreground text-xs">{{ $t('loans.detail.projection.totalInterestRemaining') }}</div>
          <div class="mt-0.5 font-medium">{{ totalInterestRemainingDisplay }}</div>
        </div>
        <div>
          <div class="text-muted-foreground text-xs">{{ $t('loans.detail.projection.nextMonthInterest') }}</div>
          <div class="mt-0.5 font-medium">{{ monthlyInterestDisplay }}</div>
        </div>
        <div>
          <div class="text-muted-foreground text-xs">{{ $t('loans.detail.projection.nextMonthPrincipal') }}</div>
          <div class="mt-0.5 font-medium">{{ monthlyPrincipalDisplay }}</div>
        </div>
        <div>
          <div class="text-muted-foreground text-xs">{{ $t('loans.detail.projection.plannedPayment') }}</div>
          <div class="mt-0.5 font-medium">{{ plannedPaymentDisplay }}</div>
        </div>
      </div>
    </CardContent>
  </Card>
</template>

<script setup lang="ts">
import type { LoanApi } from '@/api/loans';
import { Card, CardContent, CardHeader } from '@/components/lib/ui/card';
import { useFormatCurrency } from '@/composable/formatters';
import { useDateLocale } from '@/composable/use-date-locale';
import { parseISO } from 'date-fns';
import { computed } from 'vue';

const props = defineProps<{ loan: LoanApi }>();

const { formatAmountByCurrencyCode } = useFormatCurrency();
const { format: formatDate } = useDateLocale();

const currency = computed(() => props.loan.currencyCode);

const formatCurrency = (amount: number | null) => {
  if (amount === null) return '—';
  return formatAmountByCurrencyCode(amount, currency.value);
};

const paidPercentDisplay = computed(() => `${props.loan.projection.paidToDatePercent.toFixed(1)}%`);

const progressBarWidth = computed(() => Math.min(100, Math.max(0, props.loan.projection.paidToDatePercent)));

const paidDisplay = computed(() => formatCurrency(props.loan.projection.paidToDate));
const originalDisplay = computed(() => formatCurrency(props.loan.loanDetails.originalPrincipal));

const payoffDateDisplay = computed(() => {
  const date = props.loan.projection.payoffDate;
  if (!date) return '—';
  return formatDate(parseISO(date), 'MMM d, yyyy');
});

const monthsRemainingDisplay = computed(() => {
  const months = props.loan.projection.monthsRemaining;
  if (months === null) return '—';
  return String(months);
});

const totalInterestRemainingDisplay = computed(() => formatCurrency(props.loan.projection.totalInterestRemaining));
const monthlyInterestDisplay = computed(() => formatCurrency(props.loan.projection.monthlyInterest));
const monthlyPrincipalDisplay = computed(() => formatCurrency(props.loan.projection.monthlyPrincipal));
const plannedPaymentDisplay = computed(() => formatCurrency(props.loan.loanDetails.plannedPayment));
</script>
