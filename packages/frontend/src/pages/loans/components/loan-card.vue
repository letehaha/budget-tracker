<template>
  <RouterLink :to="{ name: ROUTES_NAMES.loanDetail, params: { id: loan.id } }" class="block focus:outline-none">
    <Card
      :class="
        cn(
          'group/loan-card focus-visible:ring-ring/40 @container/loan-card relative cursor-pointer overflow-hidden',
          'transition-[transform,border-color,box-shadow] duration-300 ease-out',
          'hover:border-primary/40 hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-22px_rgba(0,0,0,0.45)]',
          'focus-visible:ring-2',
        )
      "
    >
      <div :class="cn('pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-linear-to-r', loanTypeStripeClass)" />

      <div
        class="pointer-events-none absolute -top-3 -right-3 size-16 opacity-[0.06] @[22rem]/loan-card:-top-5 @[22rem]/loan-card:-right-5 @[22rem]/loan-card:size-32 dark:opacity-[0.08]"
      >
        <component :is="loanTypeIconComponent" class="size-full" stroke-width="0.9" />
      </div>

      <CardHeader class="relative pb-3">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0 flex-1">
            <div
              class="text-muted-foreground flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.18em] uppercase"
            >
              <component :is="loanTypeIconComponent" class="size-3" stroke-width="2" />
              <span>{{ $t(`loans.types.${loan.loanDetails.loanType}`) }}</span>
            </div>
            <div class="mt-1.5 truncate text-lg font-semibold tracking-tight">{{ loan.name }}</div>
            <div v-if="loan.loanDetails.lenderName" class="text-muted-foreground mt-0.5 truncate text-xs">
              {{ loan.loanDetails.lenderName }}
            </div>
          </div>

          <span
            v-if="loan.projection.isPaidOff"
            class="bg-app-income-color/15 text-app-income-color shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-medium tracking-wider uppercase"
          >
            {{ $t('loans.detail.paidOffBadge') }}
          </span>
        </div>
      </CardHeader>

      <CardContent class="relative space-y-5 pb-5">
        <div>
          <div class="flex items-baseline gap-2">
            <div class="text-app-expense-color text-3xl font-semibold tracking-tight tabular-nums">
              {{ balanceDisplay }}
            </div>
            <div class="text-muted-foreground text-[11px] font-medium tracking-wider uppercase">
              {{ loan.currencyCode }}
            </div>
          </div>
          <div class="text-muted-foreground mt-1 text-xs">
            {{ $t('loans.card.principalContext', { amount: originalPrincipalDisplay }) }}
          </div>
        </div>

        <div>
          <div class="relative h-1.5 overflow-hidden rounded-full">
            <div class="bg-muted absolute inset-0 rounded-full" />
            <div
              class="from-app-income-color/60 to-app-income-color absolute inset-y-0 left-0 rounded-full bg-linear-to-r transition-[width] duration-500 ease-out"
              :style="{ width: `${progressBarWidth}%` }"
            />
            <div
              v-if="showProgressMarker"
              class="bg-app-income-color absolute top-1/2 size-2 -translate-y-1/2 rounded-full shadow-[0_0_0_3px_color-mix(in_srgb,var(--app-income-color)_25%,transparent)]"
              :style="{ left: `calc(${progressBarWidth}% - 4px)` }"
            />
          </div>
          <div class="mt-2 flex items-baseline justify-between gap-2 text-[10px] tracking-wider uppercase">
            <span class="text-muted-foreground tabular-nums">{{ startDateDisplay }}</span>
            <span class="text-app-income-color font-semibold tracking-tight normal-case tabular-nums">
              {{ paidPercentDisplay }}
            </span>
            <span class="text-muted-foreground tabular-nums">{{ payoffDateDisplay }}</span>
          </div>
        </div>

        <div
          class="border-border/70 grid grid-cols-2 gap-x-3 gap-y-3 border-t pt-3 text-xs @[22rem]/loan-card:grid-cols-4"
        >
          <div>
            <div class="text-muted-foreground text-[10px] font-medium tracking-wider uppercase">
              {{ $t('loans.card.apr') }}
            </div>
            <div class="mt-0.5 font-semibold tabular-nums">{{ aprDisplay }}</div>
          </div>
          <div>
            <div class="text-muted-foreground text-[10px] font-medium tracking-wider uppercase">
              {{ $t('loans.card.monthly') }}
            </div>
            <div class="mt-0.5 font-semibold tabular-nums">{{ monthlyDisplay }}</div>
          </div>
          <div>
            <div class="text-muted-foreground text-[10px] font-medium tracking-wider uppercase">
              {{ $t('loans.card.monthsLeft') }}
            </div>
            <div class="mt-0.5 font-semibold tabular-nums">{{ monthsRemainingDisplay }}</div>
          </div>
          <div>
            <div class="text-muted-foreground text-[10px] font-medium tracking-wider uppercase">
              {{ $t('loans.card.interestRemaining') }}
            </div>
            <div class="mt-0.5 font-semibold tabular-nums">{{ interestRemainingDisplay }}</div>
          </div>
        </div>

        <div
          v-if="loan.projection.warning"
          class="text-app-expense-color bg-app-expense-color/10 flex items-start gap-1.5 rounded-md px-2.5 py-2 text-xs"
        >
          <TriangleAlertIcon class="mt-0.5 size-3.5 shrink-0" />
          <span>{{ $t(`loans.warnings.${loan.projection.warning}`) }}</span>
        </div>
      </CardContent>
    </Card>
  </RouterLink>
</template>

<script setup lang="ts">
import type { LoanApi } from '@/api/loans';
import { Card, CardContent, CardHeader } from '@/components/lib/ui/card';
import { useFormatCurrency } from '@/composable/formatters';
import { useDateLocale } from '@/composable/use-date-locale';
import { cn } from '@/lib/utils';
import { ROUTES_NAMES } from '@/routes';
import { LOAN_TYPE } from '@bt/shared/types';
import {
  BriefcaseIcon,
  CarIcon,
  CoinsIcon,
  GraduationCapIcon,
  HouseIcon,
  KeyRoundIcon,
  StethoscopeIcon,
  TriangleAlertIcon,
  WalletIcon,
} from '@lucide/vue';
import { parseISO } from 'date-fns';
import { computed, type Component } from 'vue';
import { useI18n } from 'vue-i18n';
import { RouterLink } from 'vue-router';

const props = defineProps<{ loan: LoanApi }>();

const { formatAmountByCurrencyCode } = useFormatCurrency();
const { format: formatDate } = useDateLocale();
const { t } = useI18n();

const balanceDisplay = computed(() =>
  formatAmountByCurrencyCode(Math.abs(props.loan.currentBalance), props.loan.currencyCode),
);

const originalPrincipalDisplay = computed(() =>
  formatAmountByCurrencyCode(props.loan.loanDetails.originalPrincipal, props.loan.currencyCode),
);

const aprDisplay = computed(() => `${props.loan.loanDetails.interestRate.toFixed(2)}%`);

const paidPercentDisplay = computed(() => {
  const pct = props.loan.projection.paidToDatePercent;
  return t('loans.card.paidPercent', { value: pct.toFixed(1) });
});

const progressBarWidth = computed(() => Math.min(100, Math.max(0, props.loan.projection.paidToDatePercent)));

const showProgressMarker = computed(() => progressBarWidth.value > 0.5 && progressBarWidth.value < 99.5);

const startDateDisplay = computed(() => formatDate(parseISO(props.loan.loanDetails.startDate), 'MMM yyyy'));

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

const monthlyDisplay = computed(() => {
  const planned = props.loan.loanDetails.plannedPayment;
  if (planned === null) return '—';
  return formatAmountByCurrencyCode(planned, props.loan.currencyCode);
});

const interestRemainingDisplay = computed(() => {
  const interest = props.loan.projection.totalInterestRemaining;
  if (interest === null) return '—';
  return formatAmountByCurrencyCode(interest, props.loan.currencyCode);
});

const LOAN_TYPE_STRIPE_CLASSES: Record<LOAN_TYPE, string> = {
  [LOAN_TYPE.mortgage]: 'from-blue-500 via-blue-500/60 to-transparent',
  [LOAN_TYPE.auto]: 'from-amber-500 via-amber-500/60 to-transparent',
  [LOAN_TYPE.student]: 'from-violet-500 via-violet-500/60 to-transparent',
  [LOAN_TYPE.personal]: 'from-emerald-500 via-emerald-500/60 to-transparent',
  [LOAN_TYPE.heloc]: 'from-cyan-500 via-cyan-500/60 to-transparent',
  [LOAN_TYPE.business]: 'from-rose-500 via-rose-500/60 to-transparent',
  [LOAN_TYPE.medical]: 'from-pink-500 via-pink-500/60 to-transparent',
  [LOAN_TYPE.other]: 'from-slate-500 via-slate-500/60 to-transparent',
};

const LOAN_TYPE_ICONS: Record<LOAN_TYPE, Component> = {
  [LOAN_TYPE.mortgage]: HouseIcon,
  [LOAN_TYPE.auto]: CarIcon,
  [LOAN_TYPE.student]: GraduationCapIcon,
  [LOAN_TYPE.personal]: WalletIcon,
  [LOAN_TYPE.heloc]: KeyRoundIcon,
  [LOAN_TYPE.business]: BriefcaseIcon,
  [LOAN_TYPE.medical]: StethoscopeIcon,
  [LOAN_TYPE.other]: CoinsIcon,
};

const loanTypeStripeClass = computed(
  () => LOAN_TYPE_STRIPE_CLASSES[props.loan.loanDetails.loanType] ?? LOAN_TYPE_STRIPE_CLASSES[LOAN_TYPE.other],
);

const loanTypeIconComponent = computed(
  () => LOAN_TYPE_ICONS[props.loan.loanDetails.loanType] ?? LOAN_TYPE_ICONS[LOAN_TYPE.other],
);
</script>
