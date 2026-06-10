<template>
  <Card class="@container/loan-summary">
    <CardHeader class="pb-3">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0 flex-1">
          <div class="truncate text-xl font-semibold">{{ loan.name }}</div>
          <div v-if="loan.loanDetails.lenderName" class="text-muted-foreground mt-1 truncate text-sm">
            {{ loan.loanDetails.lenderName }}
          </div>
        </div>
        <div class="flex shrink-0 flex-col items-end gap-1.5">
          <span
            :class="cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', loanTypeBadgeClass)"
          >
            {{ $t(`loans.types.${loan.loanDetails.loanType}`) }}
          </span>
          <span
            v-if="loan.projection.isPaidOff"
            class="bg-app-income-color/15 text-app-income-color inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
          >
            {{ $t('loans.detail.paidOffBadge') }}
          </span>
        </div>
      </div>
    </CardHeader>
    <CardContent>
      <div class="text-app-expense-color text-3xl font-semibold tracking-tight">
        {{ formatAmountByCurrencyCode(Math.abs(loan.currentBalance), loan.currencyCode) }}
      </div>
      <div class="text-muted-foreground mt-1 flex items-center gap-1 text-xs">
        <span>{{ $t('loans.detail.summary.outstanding') }}</span>
        <DesktopOnlyTooltip :content="$t('loans.detail.summary.principalOnlyTooltip')" side="top">
          <InfoIcon class="size-3 cursor-help" />
        </DesktopOnlyTooltip>
      </div>

      <div class="mt-5 grid grid-cols-2 gap-4 text-sm @sm/loan-summary:grid-cols-3">
        <div>
          <div class="text-muted-foreground text-xs">{{ $t('loans.detail.summary.apr') }}</div>
          <div class="mt-0.5 font-medium">{{ aprDisplay }}</div>
        </div>
        <div>
          <div class="text-muted-foreground text-xs">{{ $t('loans.detail.summary.originalPrincipal') }}</div>
          <div class="mt-0.5 font-medium">{{ originalPrincipalDisplay }}</div>
        </div>
        <div>
          <div class="text-muted-foreground text-xs">{{ $t('loans.detail.summary.term') }}</div>
          <div class="mt-0.5 font-medium">{{ termDisplay }}</div>
        </div>
        <div>
          <div class="text-muted-foreground text-xs">{{ $t('loans.detail.summary.startDate') }}</div>
          <div class="mt-0.5 font-medium">{{ startDateDisplay }}</div>
        </div>
        <div>
          <div class="text-muted-foreground text-xs">{{ $t('loans.detail.summary.paymentDay') }}</div>
          <div class="mt-0.5 font-medium">{{ paymentDayDisplay }}</div>
        </div>
        <div v-if="loan.loanDetails.accountNumber">
          <div class="text-muted-foreground text-xs">{{ $t('loans.detail.summary.accountNumber') }}</div>
          <div class="mt-0.5 font-medium">{{ loan.loanDetails.accountNumber }}</div>
        </div>
      </div>
    </CardContent>
  </Card>
</template>

<script setup lang="ts">
import type { LoanApi } from '@/api/loans';
import { Card, CardContent, CardHeader } from '@/components/lib/ui/card';
import { DesktopOnlyTooltip } from '@/components/lib/ui/tooltip';
import { useFormatCurrency } from '@/composable/formatters';
import { useDateLocale } from '@/composable/use-date-locale';
import { cn } from '@/lib/utils';
import { LOAN_TYPE } from '@bt/shared/types';
import { InfoIcon } from '@lucide/vue';
import { parseISO } from 'date-fns';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

const props = defineProps<{ loan: LoanApi }>();

const { formatAmountByCurrencyCode } = useFormatCurrency();
const { format: formatDate } = useDateLocale();
const { t } = useI18n();

const aprDisplay = computed(() => `${props.loan.loanDetails.interestRate.toFixed(2)}%`);

const originalPrincipalDisplay = computed(() =>
  formatAmountByCurrencyCode(props.loan.loanDetails.originalPrincipal, props.loan.currencyCode),
);

const termDisplay = computed(() => {
  const months = props.loan.loanDetails.termMonths;
  if (months === null) return '—';
  return t('loans.detail.summary.termMonths', { count: months }, months);
});

const startDateDisplay = computed(() => formatDate(parseISO(props.loan.loanDetails.startDate), 'MMM d, yyyy'));

const paymentDayDisplay = computed(() => {
  const day = props.loan.loanDetails.paymentDayOfMonth;
  if (day === null) return '—';
  return t('loans.detail.summary.dayOfMonth', { day });
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
