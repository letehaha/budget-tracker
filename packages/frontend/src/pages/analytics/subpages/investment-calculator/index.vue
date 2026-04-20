<template>
  <div
    ref="containerRef"
    class="border-border bg-card flex gap-6 rounded-lg border p-4"
    :class="isCompact ? 'flex-col' : 'flex-row'"
  >
    <!-- Inputs panel: left sidebar on wide containers, collapsible on narrow -->
    <div :class="isCompact ? 'w-full' : 'w-72 shrink-0'">
      <!-- Compact: collapsible toggle -->
      <Button
        v-if="isCompact"
        variant="secondary"
        :aria-expanded="inputsExpanded"
        class="h-auto w-full justify-between py-2.5"
        @click="inputsExpanded = !inputsExpanded"
      >
        <span class="min-w-0 truncate text-sm">
          {{ compactInputsSummary }}
        </span>
        <span class="flex shrink-0 items-center gap-1 text-sm">
          {{
            inputsExpanded
              ? $t('analytics.investmentCalculator.hideInputs')
              : $t('analytics.investmentCalculator.configure')
          }}
          <ChevronDownIcon class="size-4 transition-transform duration-200" :class="{ 'rotate-180': inputsExpanded }" />
        </span>
      </Button>

      <CalculatorInputs
        v-show="!isCompact || inputsExpanded"
        :class="{ 'mt-4': isCompact && inputsExpanded }"
        :initial-balance="initialBalance"
        :monthly-contribution="monthlyContribution"
        :time-horizon-years="timeHorizonYears"
        :annual-return-rate="annualReturnRate"
        :annual-inflation-rate="annualInflationRate"
        :selected-period="periodTabValue"
        :selected-indicator-id="selectedIndicatorId"
        :current-total-balance="currentTotalBalance"
        @update:initial-balance="initialBalance = $event"
        @update:monthly-contribution="handleManualContributionChange($event)"
        @update:time-horizon-years="timeHorizonYears = $event"
        @update:annual-return-rate="annualReturnRate = $event"
        @update:annual-inflation-rate="annualInflationRate = $event"
        @update:selected-period="handlePeriodChange"
        @update:selected-indicator-id="selectedIndicatorId = $event"
        @use-current-balance="initialBalance = currentTotalBalance"
      />
    </div>

    <!-- Results panel -->
    <div class="min-w-0 flex-1 space-y-6">
      <SummaryCards :summary="summary" />
      <ProjectionChart :data="dataPoints" :indicator-label="indicatorLabel" />
      <p class="text-muted-foreground mx-6 text-xs">
        {{ $t('analytics.investmentCalculator.disclaimer', { rate: annualReturnRate }) }}
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Button } from '@/components/lib/ui/button';
import { useFormatCurrency } from '@/composable';
import { ChevronDownIcon } from 'lucide-vue-next';
import { useElementSize } from '@vueuse/core';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

import CalculatorInputs from './components/calculator-inputs.vue';
import ProjectionChart from './components/projection-chart.vue';
import SummaryCards from './components/summary-cards.vue';
import { CUSTOM_INDICATOR_ID, getIndicatorById, MARKET_INDICATORS } from './composables/market-indicators';
import { useProjectionCalc, type ProjectionParams } from './composables/use-projection-calc';
import { useSeedData, type NetIncomePeriod } from './composables/use-seed-data';

const { t } = useI18n();
const { getCurrencySymbol } = useFormatCurrency();

// Container-based compact layout (instead of viewport breakpoints)
const COMPACT_BREAKPOINT = 830;
const containerRef = ref<HTMLDivElement | null>(null);
const { width: containerWidth } = useElementSize(containerRef);
const isCompact = computed(() => containerWidth.value <= COMPACT_BREAKPOINT);

const inputsExpanded = ref(false);

const formatCompactValue = ({ value }: { value: number }): string => {
  const symbol = getCurrencySymbol();
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${symbol}${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${symbol}${(value / 1_000).toFixed(1)}K`;
  return `${symbol}${Math.round(value)}`;
};

const compactInputsSummary = computed(() => {
  const balance = formatCompactValue({ value: initialBalance.value });
  const contribution = formatCompactValue({ value: monthlyContribution.value });
  return `${balance} · ${contribution}/mo · ${timeHorizonYears.value}yr`;
});

// Input state
const initialBalance = ref(0);
const monthlyContribution = ref(0);
const timeHorizonYears = ref(10);
const annualReturnRate = ref(MARKET_INDICATORS[0]!.avgAnnualReturn);
const annualInflationRate = ref(3); // Moderate default
const selectedPeriod = ref<NetIncomePeriod>('6mo');
const periodTabValue = ref<NetIncomePeriod | null>('6mo');
const selectedIndicatorId = ref(MARKET_INDICATORS[0]!.id);

// Seed data from backend
const { currentTotalBalance, averageNetIncome } = useSeedData({ selectedPeriod });

// Auto-seed initial balance from user's current balance (once).
// `immediate` is needed so that cached vue-query data (already non-zero on
// revisit) seeds the value without waiting for a change.
const hasSeededBalance = ref(false);
watch(
  currentTotalBalance,
  (val) => {
    if (!hasSeededBalance.value && val > 0) {
      initialBalance.value = val;
      hasSeededBalance.value = true;
    }
  },
  { immediate: true },
);

// Auto-apply average net income when period changes or on initial load.
// `immediate` is needed so cached data seeds the value on revisit.
let pendingAvgApply = true;
watch(
  averageNetIncome,
  (val) => {
    if (pendingAvgApply && val > 0) {
      monthlyContribution.value = val;
      pendingAvgApply = false;
    }
  },
  { immediate: true },
);

const handlePeriodChange = (period: NetIncomePeriod) => {
  periodTabValue.value = period;
  if (selectedPeriod.value === period) {
    monthlyContribution.value = averageNetIncome.value;
  } else {
    selectedPeriod.value = period;
    pendingAvgApply = true;
  }
};

const handleManualContributionChange = (val: number) => {
  monthlyContribution.value = val;
  periodTabValue.value = null;
};

// Derive the label for chart legend/tooltip from indicator selection
const indicatorLabel = computed(() => {
  if (selectedIndicatorId.value === CUSTOM_INDICATOR_ID) {
    return t('analytics.investmentCalculator.customIndicator');
  }
  const indicator = getIndicatorById({ id: selectedIndicatorId.value });
  return indicator?.label ?? t('analytics.investmentCalculator.customIndicator');
});

// Projection calculation
const projectionParams = computed<ProjectionParams>(() => ({
  initialBalance: initialBalance.value,
  monthlyContribution: monthlyContribution.value,
  timeHorizonYears: timeHorizonYears.value,
  annualReturnRate: annualReturnRate.value,
  annualInflationRate: annualInflationRate.value,
}));

const { dataPoints, summary } = useProjectionCalc({ params: projectionParams });
</script>
