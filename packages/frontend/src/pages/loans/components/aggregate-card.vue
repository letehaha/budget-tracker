<template>
  <Card class="@container/loans-aggregate">
    <div
      class="flex flex-col gap-6 px-5 py-5 sm:px-6 @3xl/loans-aggregate:flex-row @3xl/loans-aggregate:items-center @3xl/loans-aggregate:gap-0"
    >
      <div class="shrink-0 @3xl/loans-aggregate:pr-8">
        <div class="text-muted-foreground text-[10px] font-semibold tracking-[0.16em] uppercase">
          {{ $t('loans.aggregate.totalOutstanding') }}
        </div>
        <div class="mt-1.5 text-3xl font-semibold tracking-tight tabular-nums @sm/loans-aggregate:text-4xl">
          {{ totalLiabilitiesDisplay }}
        </div>
        <div v-if="principalRepaidDisplay" class="text-muted-foreground mt-1.5 text-xs">
          {{ principalRepaidDisplay }}
        </div>
      </div>

      <div
        v-if="compositionSegments.length > 0"
        class="@3xl/loans-aggregate:border-border/60 min-w-0 flex-1 @3xl/loans-aggregate:border-l @3xl/loans-aggregate:px-8"
      >
        <div class="flex h-3 gap-0.5 overflow-hidden rounded-md">
          <div
            v-for="segment in compositionSegments"
            :key="segment.id"
            :class="segment.barClass"
            :style="{ width: segment.width }"
          />
        </div>
        <div class="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
          <div v-for="segment in compositionSegments" :key="segment.id" class="flex items-center gap-1.5 text-xs">
            <span :class="cn('size-2 shrink-0 rounded-xs', segment.barClass)" aria-hidden="true" />
            <span class="text-muted-foreground max-w-40 truncate">{{ segment.name }}</span>
            <span class="font-medium tabular-nums">{{ segment.amountDisplay }}</span>
          </div>
        </div>
      </div>
      <div v-else class="flex-1" />

      <div
        class="@3xl/loans-aggregate:border-border/60 grid shrink-0 grid-cols-2 gap-x-8 gap-y-4 @3xl/loans-aggregate:border-l @3xl/loans-aggregate:pl-8"
      >
        <Metric :label="$t('loans.aggregate.monthlyObligation')" :value="monthlyObligationDisplay" />
        <Metric :label="$t('loans.aggregate.avgApr')" :value="avgAprDisplay" />
        <Metric :label="$t('loans.aggregate.interestProjected')" :value="interestProjectedDisplay" />
        <Metric :label="$t('loans.aggregate.debtFree')" :value="debtFreeDisplay" />
      </div>
    </div>
  </Card>
</template>

<script setup lang="ts">
import type { LoanApi } from '@/api/loans';
import { Card } from '@/components/lib/ui/card';
import { useExchangeRates } from '@/composable/data-queries/currencies';
import { useFormatCurrency } from '@/composable/formatters';
import { useDateLocale } from '@/composable/use-date-locale';
import { cn } from '@/lib/utils';
import { useCurrenciesStore } from '@/stores';
import { compareAsc, parseISO } from 'date-fns';
import { storeToRefs } from 'pinia';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

import { getLoanTypeBarClass } from '../loan-type-presentation';
import { activePrincipalRepaid, projectedInterestRemaining, weightedAvgApr } from '../utils/aggregate-metrics';
import { outstandingAmount } from '../utils/outstanding-amount';
import Metric from './aggregate-metric.vue';

const props = defineProps<{ loans: LoanApi[] }>();

const { formatBaseCurrency } = useFormatCurrency();
const { format: formatDate } = useDateLocale();
const { t } = useI18n();
const { convert } = useExchangeRates();
const { baseCurrency } = storeToRefs(useCurrenciesStore());

const PERCENT_DECIMAL_PRECISION = 2;

// Monthly obligation and the debt-free date must ignore paid-off loans: a settled loan can still
// carry a planned payment / projected payoff that would otherwise inflate or distort those totals.
const activeLoans = computed(() => props.loans.filter((loan) => !loan.projection.isPaidOff));

const totalLiabilities = computed(() =>
  props.loans.reduce((acc, loan) => acc + outstandingAmount({ balance: loan.refCurrentBalance }), 0),
);

const totalLiabilitiesDisplay = computed(() => formatBaseCurrency(totalLiabilities.value));

const principalRepaidDisplay = computed(() => {
  const repaid = activePrincipalRepaid({
    loans: props.loans,
    convert,
    baseCode: baseCurrency.value?.currencyCode,
  });
  if (!repaid) return null;
  return t('loans.aggregate.principalRepaid', {
    percent: repaid.percent.toFixed(1),
    amount: formatBaseCurrency(repaid.totalPrincipal),
  });
});

const compositionSegments = computed(() => {
  const total = totalLiabilities.value;
  if (total <= 0) return [];
  return props.loans
    .map((loan) => ({ loan, balance: outstandingAmount({ balance: loan.refCurrentBalance }) }))
    .filter(({ balance }) => balance > 0)
    .sort((a, b) => b.balance - a.balance)
    .map(({ loan, balance }) => ({
      id: loan.id,
      name: loan.name,
      barClass: getLoanTypeBarClass({ loanType: loan.loanDetails.loanType }),
      width: `${((balance / total) * 100).toFixed(2)}%`,
      amountDisplay: formatBaseCurrency(balance),
    }));
});

const weightedApr = computed(() => weightedAvgApr({ loans: props.loans }));

const avgAprDisplay = computed(() => {
  const apr = weightedApr.value;
  if (apr === null) return '—';
  return `${apr.toFixed(PERCENT_DECIMAL_PRECISION)}%`;
});

const monthlyObligation = computed(() => {
  const values = activeLoans.value
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

const debtFreeDisplay = computed(() => {
  if (!activeLoans.value.length) return '—';
  const dates = activeLoans.value.map((loan) => loan.projection.payoffDate);
  // A single loan without a projected payoff makes the "debt-free" date unknowable.
  if (dates.some((date) => !date)) return '—';
  const latest = dates
    .map((date) => parseISO(date!))
    .sort(compareAsc)
    .at(-1)!;
  return formatDate(latest, 'MMM yyyy');
});

const interestProjected = computed(() =>
  projectedInterestRemaining({
    loans: props.loans,
    convert,
    baseCode: baseCurrency.value?.currencyCode,
  }),
);

const interestProjectedDisplay = computed(() => {
  const value = interestProjected.value;
  if (value === null) return '—';
  return formatBaseCurrency(value);
});
</script>
