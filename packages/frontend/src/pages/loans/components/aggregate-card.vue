<template>
  <Card class="from-card via-card to-card @container/loans-aggregate relative overflow-hidden bg-linear-to-br">
    <div
      aria-hidden="true"
      class="pointer-events-none absolute inset-0"
      style="
        background-image:
          radial-gradient(
            ellipse 60% 80% at 100% -10%,
            color-mix(in srgb, var(--primary) 14%, transparent),
            transparent 60%
          ),
          radial-gradient(
            ellipse 50% 50% at -10% 110%,
            color-mix(in srgb, var(--app-expense-color) 10%, transparent),
            transparent 55%
          );
      "
    />

    <svg
      aria-hidden="true"
      viewBox="0 0 600 200"
      preserveAspectRatio="none"
      class="text-app-income-color pointer-events-none absolute inset-x-0 bottom-0 h-24 w-full opacity-[0.08]"
    >
      <path
        d="M 0 40 C 100 55 200 120 300 145 S 500 188 600 198"
        stroke="currentColor"
        stroke-width="1.25"
        fill="none"
        stroke-linecap="round"
      />
      <path d="M 0 200 L 600 200" stroke="currentColor" stroke-width="0.5" stroke-dasharray="2 4" opacity="0.5" />
    </svg>

    <div class="relative px-4 pt-5 pb-6 sm:px-7 sm:pt-6 sm:pb-7">
      <div
        class="grid grid-cols-1 gap-x-8 gap-y-6 @lg/loans-aggregate:grid-cols-[1.1fr_1fr] @lg/loans-aggregate:items-end"
      >
        <div>
          <div
            class="text-app-expense-color flex items-baseline gap-2 text-4xl font-semibold tracking-tight tabular-nums @sm/loans-aggregate:text-5xl"
          >
            <span>{{ totalLiabilitiesDisplay }}</span>
          </div>
          <div class="text-muted-foreground mt-2 text-xs tracking-wide">
            <i18n-t keypath="loans.aggregate.totalOwedContext" tag="span">
              <template #count>
                <span class="text-foreground font-medium">{{ loans.length }} {{ countLabel }}</span>
              </template>
            </i18n-t>
          </div>
        </div>

        <div class="@lg/loans-aggregate:justify-self-end">
          <div
            class="border-border/60 grid grid-cols-2 gap-x-5 gap-y-4 border-l-0 @lg/loans-aggregate:border-l @lg/loans-aggregate:pl-8"
          >
            <Metric :label="$t('loans.aggregate.avgApr')" :value="avgAprDisplay" />
            <Metric :label="$t('loans.aggregate.monthlyObligation')" :value="monthlyObligationDisplay" />
            <Metric :label="$t('loans.aggregate.earliestPayoff')" :value="earliestPayoffDisplay" />
            <Metric :label="$t('loans.aggregate.interestProjected')" :value="interestProjectedDisplay" />
          </div>
        </div>
      </div>
    </div>
  </Card>
</template>

<script setup lang="ts">
import type { LoanApi } from '@/api/loans';
import { Card } from '@/components/lib/ui/card';
import { useDateLocale } from '@/composable/use-date-locale';
import { useExchangeRates } from '@/composable/data-queries/currencies';
import { useFormatCurrency } from '@/composable/formatters';
import { useCurrenciesStore } from '@/stores';
import { parseISO } from 'date-fns';
import { storeToRefs } from 'pinia';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

import Metric from './aggregate-metric.vue';

const props = defineProps<{ loans: LoanApi[] }>();

const { formatBaseCurrency } = useFormatCurrency();
const { format: formatDate } = useDateLocale();
const { t } = useI18n();
const { convert } = useExchangeRates();
const { baseCurrency } = storeToRefs(useCurrenciesStore());

const PERCENT_DECIMAL_PRECISION = 2;

const totalLiabilities = computed(() => props.loans.reduce((acc, loan) => acc + Math.abs(loan.refCurrentBalance), 0));

const totalLiabilitiesDisplay = computed(() => formatBaseCurrency(totalLiabilities.value));

const countLabel = computed(() => t('loans.aggregate.count', props.loans.length));

const weightedAvgApr = computed(() => {
  if (!props.loans.length) return null;
  const totalBalance = totalLiabilities.value;
  if (totalBalance <= 0) {
    const sum = props.loans.reduce((acc, loan) => acc + loan.loanDetails.interestRate, 0);
    return sum / props.loans.length;
  }
  const weighted = props.loans.reduce(
    (acc, loan) => acc + loan.loanDetails.interestRate * Math.abs(loan.refCurrentBalance),
    0,
  );
  return weighted / totalBalance;
});

const avgAprDisplay = computed(() => {
  const apr = weightedAvgApr.value;
  if (apr === null) return '—';
  return `${apr.toFixed(PERCENT_DECIMAL_PRECISION)}%`;
});

const monthlyObligation = computed(() => {
  const values = props.loans
    .map((loan) => loan.loanDetails.refPlannedPayment)
    .filter((v): v is number => v !== null && v !== undefined);
  if (!values.length) return null;
  return values.reduce((acc, v) => acc + v, 0);
});

const monthlyObligationDisplay = computed(() => {
  const value = monthlyObligation.value;
  if (value === null) return '—';
  return formatBaseCurrency(value);
});

const earliestPayoffDisplay = computed(() => {
  const dates = props.loans.map((loan) => loan.projection.payoffDate).filter((d): d is string => !!d);
  if (!dates.length) return '—';
  const sorted = [...dates].sort();
  return formatDate(parseISO(sorted[0]!), 'MMM yyyy');
});

const interestProjected = computed(() => {
  // Projection values are per-loan currency — convert before summing. Render "—" if any rate is
  // unavailable rather than silently understate the total.
  const baseCode = baseCurrency.value?.currencyCode;
  if (!baseCode) return null;
  const withProjection = props.loans.filter((loan) => loan.projection.totalInterestRemaining !== null);
  if (!withProjection.length) return null;
  let sum = 0;
  for (const loan of withProjection) {
    const converted = convert({
      amount: loan.projection.totalInterestRemaining!,
      from: loan.currencyCode,
      to: baseCode,
    });
    if (converted === null) return null;
    sum += converted;
  }
  return sum;
});

const interestProjectedDisplay = computed(() => {
  const value = interestProjected.value;
  if (value === null) return '—';
  return formatBaseCurrency(value);
});
</script>
