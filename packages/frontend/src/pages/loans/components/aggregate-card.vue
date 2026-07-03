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
import Metric from './aggregate-metric.vue';

const props = defineProps<{ loans: LoanApi[] }>();

const { formatBaseCurrency } = useFormatCurrency();
const { format: formatDate } = useDateLocale();
const { t } = useI18n();
const { convert } = useExchangeRates();
const { baseCurrency } = storeToRefs(useCurrenciesStore());

const PERCENT_DECIMAL_PRECISION = 2;

// Forward-looking metrics (monthly obligation, weighted APR) must ignore paid-off loans: a settled
// loan can still carry a planned payment / interest rate that would otherwise inflate the totals.
const activeLoans = computed(() => props.loans.filter((loan) => !loan.projection.isPaidOff));

const totalLiabilities = computed(() => props.loans.reduce((acc, loan) => acc + Math.abs(loan.refCurrentBalance), 0));

const totalLiabilitiesDisplay = computed(() => formatBaseCurrency(totalLiabilities.value));

const principalRepaidDisplay = computed(() => {
  // Only active loans count: a settled loan's principal would pad the % with debt that no longer
  // exists, and with zero active loans "100% of $0 repaid" is meaningless — hidden via the guard below.
  const loans = activeLoans.value;
  const totalPrincipal = loans.reduce((acc, loan) => acc + loan.loanDetails.refOriginalPrincipal, 0);
  if (totalPrincipal <= 0) return null;
  const outstanding = loans.reduce((acc, loan) => acc + Math.abs(loan.refCurrentBalance), 0);
  // Balance can exceed principal when interest has accrued — clamp so we never show a negative "repaid".
  const percent = Math.min(100, Math.max(0, ((totalPrincipal - outstanding) / totalPrincipal) * 100));
  return t('loans.aggregate.principalRepaid', {
    percent: percent.toFixed(1),
    amount: formatBaseCurrency(totalPrincipal),
  });
});

const compositionSegments = computed(() => {
  const total = totalLiabilities.value;
  if (total <= 0) return [];
  return props.loans
    .map((loan) => ({ loan, balance: Math.abs(loan.refCurrentBalance) }))
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

const weightedAvgApr = computed(() => {
  const loans = activeLoans.value;
  if (!loans.length) return null;
  const totalBalance = loans.reduce((acc, loan) => acc + Math.abs(loan.refCurrentBalance), 0);
  if (totalBalance <= 0) {
    const sum = loans.reduce((acc, loan) => acc + loan.loanDetails.interestRate, 0);
    return sum / loans.length;
  }
  const weighted = loans.reduce(
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
