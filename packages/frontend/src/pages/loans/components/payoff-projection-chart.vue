<template>
  <div class="@container/loan-payoff flex flex-col gap-4">
    <!-- Paid off: nothing to project -->
    <div v-if="isPaidOff" class="text-muted-foreground py-8 text-center text-sm">
      {{ $t('loans.detail.payoffChart.paidOff') }}
    </div>

    <template v-else>
      <!-- Header: the title sits opposite the "play with numbers" custom-payment
           field as a single inline row (label · input · save). The icon-button
           applies the typed amount as the loan's planned payment behind a confirm
           dialog; its meaning is surfaced on hover. -->
      <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div v-if="withTitle" class="flex items-center gap-1.5 text-base font-semibold">
          {{ $t('loans.detail.payoffChart.title') }}
          <HintIcon :content="$t('loans.detail.payoffChart.titleHint')" />
        </div>
        <div class="flex items-center gap-1">
          <span class="text-muted-foreground shrink-0 text-sm">
            {{ $t('loans.detail.payoffChart.customPaymentLabel') }}
          </span>
          <div class="w-28">
            <InputField
              :model-value="customPayment"
              type="number"
              :only-positive="true"
              :aria-label="$t('loans.detail.payoffChart.customPaymentLabel')"
              :placeholder="customPaymentPlaceholder"
              @update:model-value="onCustomInput"
            />
          </div>

          <DesktopOnlyTooltip :content="$t('loans.detail.payoffChart.applyAsPlanned')" side="top">
            <span>
              <Button
                variant="outline"
                size="icon"
                class="shrink-0"
                :disabled="!canApply || updateLoanMutation.isPending.value"
                :aria-label="$t('loans.detail.payoffChart.applyAsPlanned')"
                @click="isApplyOpen = true"
              >
                <SaveIcon class="size-4" />
              </Button>
            </span>
          </DesktopOnlyTooltip>
        </div>
      </div>

      <!-- A custom payment too small to cover interest never amortizes. -->
      <div v-if="customBelowInterest" class="text-app-expense-color bg-app-expense-color/10 rounded px-3 py-2 text-xs">
        {{ $t('loans.detail.payoffChart.belowInterest') }}
      </div>

      <!-- Nothing projectable yet (no planned/min/custom payment). -->
      <div v-if="!hasAnyLine" class="text-muted-foreground py-8 text-center text-sm">
        {{ $t('loans.detail.payoffChart.enterPaymentPrompt') }}
      </div>

      <template v-else>
        <div ref="containerRef" class="relative h-72 w-full sm:h-80">
          <svg ref="svgRef" class="h-full w-full"></svg>

          <div
            v-show="tooltip.visible"
            ref="tooltipRef"
            class="bg-card-tooltip text-card-tooltip-foreground pointer-events-none absolute z-10 rounded-lg border px-3 py-2 text-xs shadow-lg"
            :style="{ left: `${tooltip.x}px`, top: `${tooltip.y}px` }"
          >
            <div class="text-muted-foreground mb-1 text-[10px] tracking-wide uppercase">{{ tooltip.dateLabel }}</div>
            <div v-for="entry in tooltip.entries" :key="entry.key" class="flex items-center gap-2 whitespace-nowrap">
              <span class="inline-block size-2 rounded-full" :style="{ backgroundColor: entry.color }" />
              <span class="text-muted-foreground">{{ entry.label }}:</span>
              <span class="font-medium tabular-nums">
                {{ entry.paidOff ? $t('loans.detail.payoffChart.paidOffShort') : formatCurrency(entry.value) }}
              </span>
            </div>
          </div>
        </div>

        <!-- Legend: one row per scenario with its payoff date. -->
        <div class="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs">
          <div v-for="entry in legendEntries" :key="entry.key" class="flex items-center gap-2">
            <span
              v-if="entry.dashed"
              class="inline-block w-5 border-t-2 border-dashed"
              :class="entry.borderClass"
            ></span>
            <span v-else class="inline-block h-0.5 w-5 rounded-full" :class="entry.bgClass"></span>
            <span class="text-muted-foreground">{{ entry.name }}</span>
            <span class="font-medium tabular-nums">{{ entry.payoffText }}</span>
          </div>
        </div>

        <!-- Interest & time saved/cost vs the planned payment. -->
        <div v-if="comparisons.length" class="grid grid-cols-1 gap-3 @lg/loan-payoff:grid-cols-2">
          <div v-for="c in comparisons" :key="c.key" class="bg-muted/40 rounded-lg px-3 py-2.5">
            <div class="mb-1.5 text-xs font-medium">{{ c.name }}</div>
            <template v-if="c.hasBaseline">
              <div class="flex items-center justify-between gap-2 text-xs">
                <span class="text-muted-foreground">{{ $t('loans.detail.payoffChart.interestVsPlanned') }}</span>
                <span
                  class="shrink-0 font-medium whitespace-nowrap tabular-nums"
                  :class="c.savesInterest ? 'text-app-income-color' : c.costsInterest ? 'text-app-expense-color' : ''"
                >
                  {{ c.interestText }}
                </span>
              </div>
              <div class="mt-1 flex items-center justify-between gap-2 text-xs">
                <span class="text-muted-foreground">{{ $t('loans.detail.payoffChart.payoffVsPlanned') }}</span>
                <span
                  class="shrink-0 font-medium whitespace-nowrap"
                  :class="c.faster ? 'text-app-income-color' : c.slower ? 'text-app-expense-color' : ''"
                >
                  {{ c.timeText }}
                </span>
              </div>
            </template>
            <template v-else>
              <div class="flex items-center justify-between gap-2 text-xs">
                <span class="text-muted-foreground">{{ $t('loans.detail.projection.payoffDate') }}</span>
                <span class="shrink-0 font-medium whitespace-nowrap">{{ c.payoffDateText }}</span>
              </div>
              <div class="mt-1 flex items-center justify-between gap-2 text-xs">
                <span class="text-muted-foreground">{{ $t('loans.detail.projection.totalInterestRemaining') }}</span>
                <span class="shrink-0 font-medium whitespace-nowrap tabular-nums">{{ c.totalInterestText }}</span>
              </div>
            </template>
          </div>
        </div>
      </template>
    </template>

    <ResponsiveAlertDialog
      v-model:open="isApplyOpen"
      :confirm-label="$t('loans.detail.payoffChart.applyAsPlanned')"
      :confirm-disabled="updateLoanMutation.isPending.value"
      @confirm="handleApply"
    >
      <template #title>{{ $t('loans.detail.payoffChart.applyConfirmTitle') }}</template>
      <template #description>
        {{ $t('loans.detail.payoffChart.applyConfirmDescription', { amount: appliedAmountDisplay }) }}
      </template>
    </ResponsiveAlertDialog>
  </div>
</template>

<script setup lang="ts">
import type { LoanApi } from '@/api/loans';
import { currentTheme } from '@/common/utils/color-theme';
import HintIcon from '@/components/common/hint-icon.vue';
import ResponsiveAlertDialog from '@/components/common/responsive-alert-dialog.vue';
import InputField from '@/components/fields/input-field.vue';
import { Button } from '@/components/lib/ui/button';
import { DesktopOnlyTooltip } from '@/components/lib/ui/tooltip';
import { useNotificationCenter } from '@/components/notification-center';
import { formatAxisCurrency } from '@/composable/charts/format-axis-currency';
import { useChartTooltipPosition } from '@/composable/charts/use-chart-tooltip-position';
import { useUpdateLoan } from '@/composable/data-queries/loans';
import { useFormatCurrency } from '@/composable/formatters';
import { useDateLocale } from '@/composable/use-date-locale';
import { captureException } from '@/lib/sentry';
import { refDebounced, useResizeObserver } from '@vueuse/core';
import { startOfToday } from 'date-fns';
import { SaveIcon } from '@lucide/vue';
import { computed, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

import { usePayoffChartRender } from '../composables/use-payoff-chart-render';
import {
  type PayoffScenario,
  comparePayoffScenarios,
  computeMinimumPaymentFromTerm,
  computePayoffScenario,
} from '../utils/payoff-schedule';

const props = defineProps<{ loan: LoanApi; withTitle?: boolean }>();

const { t } = useI18n();
const { formatAmountByCurrencyCode, getCurrencySymbol } = useFormatCurrency();
const { format: formatDate } = useDateLocale();
const { addSuccessNotification, addErrorNotification } = useNotificationCenter();
const updateLoanMutation = useUpdateLoan();

// Reference "now" anchoring every scenario; fixed for the component's lifetime.
const today = startOfToday();

const MONTHS_PER_YEAR = 12;
// Typographic minus (U+2212), not a hyphen-minus, to align with the `+` glyph in tabular figures.
const MINUS_SIGN = '−';

type ScenarioKey = 'minimum' | 'planned' | 'custom';

const currencyCode = computed(() => props.loan.currencyCode);
const isPaidOff = computed(() => props.loan.projection.isPaidOff);
const balance = computed(() => Math.abs(props.loan.currentBalance));
const apr = computed(() => props.loan.loanDetails.interestRate);
const plannedPayment = computed(() => props.loan.loanDetails.plannedPayment);

const formatCurrency = (amount: number) => formatAmountByCurrencyCode(amount, currencyCode.value);

const currencySymbol = computed(() => getCurrencySymbol(currencyCode.value));

// Minimum payment: a saved value wins; otherwise derive the level payment that
// amortizes the original principal over the contractual term.
const minimumPayment = computed<number | null>(() => {
  const saved = props.loan.loanDetails.minPayment;
  if (saved != null && saved > 0) return saved;
  return computeMinimumPaymentFromTerm({
    principal: props.loan.loanDetails.originalPrincipal,
    interestRate: apr.value,
    termMonths: props.loan.loanDetails.termMonths,
  });
});

// Custom payment seeds from the planned (or minimum) payment so the curve
// starts on a sensible value the user can then nudge.
const customPayment = ref<number | null>(plannedPayment.value ?? minimumPayment.value ?? null);

const onCustomInput = (value: string | number | null) => {
  customPayment.value = typeof value === 'number' ? value : null;
};

// The field updates immediately (responsive typing), but every projection,
// warning, and the apply action read this debounced copy so we don't recompute
// the schedule or flash a "below interest" error on each intermediate keystroke.
const CUSTOM_PAYMENT_DEBOUNCE_MS = 400;
const debouncedCustomPayment = refDebounced(customPayment, CUSTOM_PAYMENT_DEBOUNCE_MS);

interface ScenarioDef {
  key: ScenarioKey;
  payment: number | null;
  dashed: boolean;
  scenario: PayoffScenario | null;
}

const scenarioDefs = computed<ScenarioDef[]>(() => {
  const defs: { key: ScenarioKey; payment: number | null; dashed: boolean }[] = [
    { key: 'minimum', payment: minimumPayment.value, dashed: true },
    { key: 'planned', payment: plannedPayment.value, dashed: false },
    { key: 'custom', payment: debouncedCustomPayment.value, dashed: false },
  ];
  return defs.map((def) => ({
    ...def,
    scenario:
      def.payment != null && def.payment > 0
        ? computePayoffScenario({ balance: balance.value, interestRate: apr.value, payment: def.payment, today })
        : null,
  }));
});

const scenarioMap = computed(
  () => Object.fromEntries(scenarioDefs.value.map((d) => [d.key, d])) as Record<ScenarioKey, ScenarioDef>,
);

const renderableLines = computed(() =>
  scenarioDefs.value.filter((d) => d.scenario?.paysOff && d.scenario.points.length > 1),
);
const hasAnyLine = computed(() => renderableLines.value.length > 0);

const customBelowInterest = computed(() => {
  const custom = scenarioMap.value.custom;
  return custom?.payment != null && custom.payment > 0 && !custom.scenario?.paysOff;
});

const SCENARIO_SWATCH: Record<ScenarioKey, { dashed: boolean; bgClass?: string; borderClass?: string }> = {
  minimum: { dashed: true, borderClass: 'border-muted-foreground' },
  planned: { dashed: false, bgClass: 'bg-primary' },
  custom: { dashed: false, bgClass: 'bg-app-income-color' },
};

const legendEntries = computed(() =>
  scenarioDefs.value
    .filter((d) => d.payment != null && d.payment > 0)
    .map((d) => ({
      key: d.key,
      name: t(`loans.detail.payoffChart.legend.${d.key}`),
      dashed: SCENARIO_SWATCH[d.key].dashed,
      bgClass: SCENARIO_SWATCH[d.key].bgClass,
      borderClass: SCENARIO_SWATCH[d.key].borderClass,
      payoffText: d.scenario?.paysOff
        ? formatDate(d.scenario.payoffDate as Date, 'MMM yyyy')
        : t('loans.detail.payoffChart.neverPaysOff'),
    })),
);

const formatDuration = (totalMonths: number): string => {
  const years = Math.floor(totalMonths / MONTHS_PER_YEAR);
  const months = totalMonths % MONTHS_PER_YEAR;
  if (years === 0) return t('loans.detail.payoffChart.monthsLabel', { n: months });
  if (months === 0) return t('loans.detail.payoffChart.yearsLabel', { n: years });
  return t('loans.detail.payoffChart.yearsMonthsLabel', { y: years, m: months });
};

// Per-scenario comparison vs the planned payment (the baseline). When there's
// no planned baseline, fall back to an absolute payoff/interest summary.
const comparisons = computed(() => {
  const planned = scenarioMap.value.planned?.scenario;
  const baseline = planned?.paysOff ? planned : null;

  const result: Array<{
    key: ScenarioKey;
    name: string;
    hasBaseline: boolean;
    savesInterest?: boolean;
    costsInterest?: boolean;
    faster?: boolean;
    slower?: boolean;
    interestText?: string;
    timeText?: string;
    payoffDateText?: string;
    totalInterestText?: string;
  }> = [];

  for (const key of ['custom', 'minimum'] as const) {
    const def = scenarioMap.value[key];
    const scenario = def?.scenario;
    if (!def || def.payment == null || def.payment <= 0 || !scenario?.paysOff) continue;

    const name = t(`loans.detail.payoffChart.legend.${key}`);

    if (baseline) {
      const { savesInterest, costsInterest, faster, slower, sameInterest, sameTime, interestDelta, monthsDelta } =
        comparePayoffScenarios({ scenario, baseline });

      result.push({
        key,
        name,
        hasBaseline: true,
        savesInterest,
        costsInterest,
        faster,
        slower,
        interestText: sameInterest
          ? t('loans.detail.payoffChart.sameAsPlanned')
          : `${interestDelta < 0 ? MINUS_SIGN : '+'}${formatCurrency(Math.abs(interestDelta))}`,
        timeText: sameTime
          ? t('loans.detail.payoffChart.sameAsPlanned')
          : monthsDelta < 0
            ? t('loans.detail.payoffChart.earlierBy', { time: formatDuration(Math.abs(monthsDelta)) })
            : t('loans.detail.payoffChart.laterBy', { time: formatDuration(monthsDelta) }),
      });
    } else {
      result.push({
        key,
        name,
        hasBaseline: false,
        payoffDateText: formatDate(scenario.payoffDate as Date, 'MMM d, yyyy'),
        totalInterestText: formatCurrency(scenario.totalInterest ?? 0),
      });
    }
  }

  return result;
});

// "Apply as planned payment" — persists the custom amount as the loan's planned
// monthly payment.
const canApply = computed(() => {
  const custom = scenarioMap.value.custom;
  return (
    custom?.payment != null &&
    custom.payment > 0 &&
    custom.scenario?.paysOff === true &&
    custom.payment !== plannedPayment.value
  );
});

const appliedAmountDisplay = computed(() => formatCurrency(debouncedCustomPayment.value ?? 0));
const customPaymentPlaceholder = computed(() => formatCurrency(minimumPayment.value ?? 0));

const isApplyOpen = ref(false);

const handleApply = async () => {
  if (debouncedCustomPayment.value == null) return;
  try {
    await updateLoanMutation.mutateAsync({ id: props.loan.id, plannedPayment: debouncedCustomPayment.value });
    isApplyOpen.value = false;
    addSuccessNotification(t('loans.detail.payoffChart.applySuccess'));
  } catch (error) {
    addErrorNotification(t('loans.detail.payoffChart.applyError'));
    captureException({ error, context: { source: 'loanPayoffChart.applyAsPlanned' } });
  }
};

// --- Chart rendering -------------------------------------------------------

const containerRef = ref<HTMLDivElement | null>(null);
const svgRef = ref<SVGSVGElement | null>(null);
const tooltipRef = ref<HTMLDivElement | null>(null);

const tooltip = reactive({
  visible: false,
  x: 0,
  y: 0,
  dateLabel: '',
  entries: [] as Array<{ key: ScenarioKey; color: string; label: string; value: number; paidOff: boolean }>,
});

const { updateTooltipPosition } = useChartTooltipPosition({ containerRef, tooltipRef, tooltip });

const formatAxisValue = (value: number) => formatAxisCurrency({ value, symbol: currencySymbol.value });

const { render } = usePayoffChartRender({
  svgRef,
  containerRef,
  renderableLines,
  today,
  tooltip,
  updateTooltipPosition,
  formatAxisValue,
  formatDate,
  t,
});

useResizeObserver(containerRef, render);
// Re-render off the debounced value so the curve only redraws once the user
// settles on an amount, not on every keystroke.
watch([() => props.loan, debouncedCustomPayment, currentTheme], render, { deep: true });
</script>
