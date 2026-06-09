<template>
  <Card class="@container/loan-card transition-shadow hover:shadow-md">
    <CardHeader class="pb-3">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0 flex-1">
          <div class="truncate text-base font-semibold">{{ loan.name }}</div>
          <div v-if="loan.loanDetails.lenderName" class="text-muted-foreground mt-0.5 truncate text-xs">
            {{ loan.loanDetails.lenderName }}
          </div>
        </div>
        <span
          :class="
            cn('inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium', loanTypeBadgeClass)
          "
        >
          {{ $t(`loans.types.${loan.loanDetails.loanType}`) }}
        </span>
      </div>
    </CardHeader>
    <CardContent class="space-y-3">
      <div>
        <div class="text-app-expense-color text-2xl font-semibold tracking-tight">
          {{ formatAmountByCurrencyCode(Math.abs(loan.currentBalance), loan.currencyCode) }}
        </div>
        <div class="text-muted-foreground mt-0.5 text-xs">{{ $t('loans.card.currentBalance') }}</div>
      </div>

      <div>
        <div class="mb-1 flex items-center justify-between text-xs">
          <span class="text-muted-foreground">{{ $t('loans.card.paidLabel') }}</span>
          <span class="font-medium">{{ paidPercentDisplay }}</span>
        </div>
        <div class="bg-muted h-1.5 w-full overflow-hidden rounded-full">
          <div
            class="bg-app-income-color h-full rounded-full transition-[width] duration-300"
            :style="{ width: `${progressBarWidth}%` }"
          />
        </div>
      </div>

      <div class="grid grid-cols-2 gap-3 text-xs @sm/loan-card:grid-cols-3">
        <div>
          <div class="text-muted-foreground">{{ $t('loans.card.apr') }}</div>
          <div class="mt-0.5 font-medium">{{ aprDisplay }}</div>
        </div>
        <div>
          <div class="text-muted-foreground">{{ $t('loans.card.payoffDate') }}</div>
          <div class="mt-0.5 font-medium">{{ payoffDateDisplay }}</div>
        </div>
        <div>
          <div class="text-muted-foreground">{{ $t('loans.card.monthsRemaining') }}</div>
          <div class="mt-0.5 font-medium">{{ monthsRemainingDisplay }}</div>
        </div>
      </div>

      <div
        v-if="loan.projection.warning"
        class="text-app-expense-color bg-app-expense-color/10 rounded px-2 py-1.5 text-xs"
      >
        {{ $t(`loans.warnings.${loan.projection.warning}`) }}
      </div>
    </CardContent>
  </Card>
</template>

<script setup lang="ts">
import type { LoanApi } from '@/api/loans';
import { Card, CardContent, CardHeader } from '@/components/lib/ui/card';
import { useFormatCurrency } from '@/composable/formatters';
import { cn } from '@/lib/utils';
import { LOAN_TYPE } from '@bt/shared/types';
import { useDateLocale } from '@/composable/use-date-locale';
import { parseISO } from 'date-fns';
import { computed } from 'vue';

const props = defineProps<{ loan: LoanApi }>();

const { formatAmountByCurrencyCode } = useFormatCurrency();
const { format: formatDate } = useDateLocale();

const aprDisplay = computed(() => `${props.loan.loanDetails.interestRate.toFixed(2)}%`);

const paidPercentDisplay = computed(() => {
  const pct = props.loan.projection.paidToDatePercent;
  return `${pct.toFixed(1)}%`;
});

const progressBarWidth = computed(() => Math.min(100, Math.max(0, props.loan.projection.paidToDatePercent)));

const payoffDateDisplay = computed(() => {
  const date = props.loan.projection.payoffDate;
  if (!date) return '—';
  return formatDate(parseISO(date), 'MMM yyyy');
});

const monthsRemainingDisplay = computed(() => {
  const months = props.loan.projection.monthsRemaining;
  if (months === null) return '—';
  return String(months);
});

const LOAN_TYPE_BADGE_CLASSES: Record<LOAN_TYPE, string> = {
  [LOAN_TYPE.mortgage]: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  [LOAN_TYPE.auto]: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  [LOAN_TYPE.student]: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
  [LOAN_TYPE.personal]: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  [LOAN_TYPE.heloc]: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400',
  [LOAN_TYPE.business]: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
  [LOAN_TYPE.medical]: 'bg-pink-500/10 text-pink-600 dark:text-pink-400',
  [LOAN_TYPE.other]: 'bg-slate-500/10 text-slate-600 dark:text-slate-400',
};

const loanTypeBadgeClass = computed(
  () => LOAN_TYPE_BADGE_CLASSES[props.loan.loanDetails.loanType] ?? LOAN_TYPE_BADGE_CLASSES[LOAN_TYPE.other],
);
</script>
