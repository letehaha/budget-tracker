<template>
  <section class="border-border bg-card @container/target space-y-4 rounded-lg border p-4">
    <div>
      <h2 class="text-sm font-semibold">{{ $t('netWorthDrivers.target.title') }}</h2>
      <p class="text-muted-foreground text-xs">{{ $t('netWorthDrivers.target.subtitle') }}</p>
    </div>

    <p v-if="view.kind === 'unreachable'" class="text-muted-foreground text-sm">
      {{ $t('netWorthDrivers.target.noReturn') }}
    </p>

    <!-- Answer first: the portfolio value to aim for and how far along the user is. -->
    <div v-else class="space-y-3">
      <div class="space-y-2">
        <div>
          <div class="text-muted-foreground text-xs">{{ $t('netWorthDrivers.target.valueNeeded') }}</div>
          <div class="text-2xl font-semibold">{{ view.valueNeeded }}</div>
        </div>

        <div class="bg-muted h-2.5 overflow-hidden rounded-full">
          <div
            class="bg-primary h-full rounded-full transition-[width] duration-300"
            :style="{ width: `${view.progressPct}%` }"
          />
        </div>

        <p v-if="view.reached" class="text-success-text text-xs">
          {{ $t('netWorthDrivers.target.progressReached') }}
        </p>
        <p v-else class="text-muted-foreground text-xs">
          {{
            $t('netWorthDrivers.target.progressLine', {
              pct: view.progressPct,
              current: view.currentAmount,
              needed: view.valueNeeded,
            })
          }}
        </p>
      </div>

      <p class="text-muted-foreground text-sm">
        {{ $t('netWorthDrivers.target.currentShareLine', { current: view.currentShare, target: targetSharePct }) }}
      </p>

      <div class="grid grid-cols-1 gap-4 @sm/target:grid-cols-2">
        <div class="border-border bg-background rounded-lg border p-3">
          <div class="text-muted-foreground text-xs">{{ $t('netWorthDrivers.target.gapLabel') }}</div>
          <div class="text-lg font-semibold" :class="{ 'text-success-text': view.reached }">{{ view.gapText }}</div>
        </div>

        <div class="border-border bg-background rounded-lg border p-3">
          <div class="text-muted-foreground text-xs">{{ $t('netWorthDrivers.target.timeLabel') }}</div>
          <div class="text-lg font-semibold">{{ view.etaText }}</div>
          <div v-if="view.showEtaHint" class="text-muted-foreground mt-0.5 text-xs">
            {{ $t('netWorthDrivers.target.etaHint') }}
          </div>
        </div>
      </div>
    </div>

    <!-- Inputs the target rests on, demoted below the answer so they read as assumptions. -->
    <div class="border-border bg-background/50 space-y-3 rounded-lg border p-3">
      <div class="text-muted-foreground text-xs font-medium tracking-wider uppercase">
        {{ $t('netWorthDrivers.target.assumptionsLabel') }}
      </div>

      <div class="grid grid-cols-1 gap-4 @md/target:grid-cols-3">
        <div class="space-y-1.5">
          <div class="flex items-center justify-between gap-2">
            <label class="text-sm font-medium">{{ $t('netWorthDrivers.target.targetShareLabel') }}</label>
            <span class="text-muted-foreground text-amount text-sm">{{ targetSharePct }}%</span>
          </div>
          <Slider
            :model-value="targetSharePct"
            :min="TARGET_MIN"
            :max="TARGET_MAX"
            :step="TARGET_STEP"
            @update:model-value="targetSharePct = $event"
          />
          <div class="text-muted-foreground flex justify-between text-xs">
            <span>{{ TARGET_MIN }}%</span>
            <span>{{ TARGET_MAX }}%</span>
          </div>
        </div>

        <AnnualReturnField v-model:indicator-id="returnIndicatorId" v-model:rate="returnRate" />

        <div class="space-y-1.5">
          <label class="text-sm font-medium">{{ $t('netWorthDrivers.target.savingsLabel') }}</label>
          <InputField
            :model-value="savingsInputValue"
            type="number"
            :placeholder="$t('netWorthDrivers.target.savingsPlaceholder')"
            @update:model-value="onSavingsInput($event)"
          >
            <template #iconLeading>
              <span class="text-muted-foreground text-sm">{{ getCurrencySymbol() }}</span>
            </template>
          </InputField>
          <Button
            v-if="savingsOverride !== null"
            variant="link"
            class="text-muted-foreground h-auto p-0 text-xs underline underline-offset-2 hover:no-underline"
            @click="resetSavings"
          >
            {{ $t('netWorthDrivers.target.savingsResetToAverage', { amount: formatBaseCurrency(seedSavingsRounded) }) }}
          </Button>
        </div>
      </div>
    </div>

    <p class="text-muted-foreground text-xs">{{ $t('netWorthDrivers.target.disclaimer') }}</p>
  </section>
</template>

<script setup lang="ts">
import InputField from '@/components/fields/input-field.vue';
import { Button } from '@/components/lib/ui/button';
import { Slider } from '@/components/lib/ui/slider';
import { useFormatCurrency } from '@/composable';
import { useLocalStorage } from '@vueuse/core';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

import AnnualReturnField from './annual-return-field.vue';
import { computeFireTarget } from '../composables/fire-target';

const props = defineProps<{
  /** Holdings value now, seeded from the report's most recent bucket. */
  currentPortfolioValue: number;
  /** Average monthly saving over the window, the default the user can override. */
  avgMonthlySavings: number;
}>();

const { t } = useI18n();
const { formatBaseCurrency, getCurrencySymbol } = useFormatCurrency();

const TARGET_MIN = 50;
const TARGET_MAX = 95;
const TARGET_STEP = 5;
const DEFAULT_TARGET_SHARE_PCT = 80;
// The most conservative preset, so a first-time reader starts from a defensible
// baseline rather than their own (possibly crypto-inflated) return.
const DEFAULT_RETURN_INDICATOR = 'sp500';
const DEFAULT_RETURN_RATE = 10;

const targetSharePct = useLocalStorage('net-worth-drivers-target-share-pct', DEFAULT_TARGET_SHARE_PCT);
const returnIndicatorId = useLocalStorage('net-worth-drivers-target-return-indicator', DEFAULT_RETURN_INDICATOR);
const returnRate = useLocalStorage('net-worth-drivers-target-return-rate', DEFAULT_RETURN_RATE);

// Null follows the seeded average; a number is a saving the user typed to model a
// different future (e.g. one job instead of two).
const savingsOverride = useLocalStorage<number | null>('net-worth-drivers-target-savings', null);

const seedSavingsRounded = computed(() => Math.round(props.avgMonthlySavings));
const savingsInputValue = computed(() => savingsOverride.value ?? seedSavingsRounded.value);
const effectiveSavings = computed(() => savingsOverride.value ?? props.avgMonthlySavings);

const toNumber = (value: string | number | null): number => {
  if (value === null || value === '') return 0;
  return Number(value) || 0;
};

const onSavingsInput = (value: string | number | null) => {
  savingsOverride.value = toNumber(value);
};

const resetSavings = () => {
  savingsOverride.value = null;
};

const formatYears = (years: number): number => Math.max(Math.round(years * 10) / 10, 0.1);

const result = computed(() =>
  computeFireTarget({
    currentPortfolioValue: props.currentPortfolioValue,
    monthlySavings: effectiveSavings.value,
    annualReturnRatePct: returnRate.value,
    targetGrowthSharePct: targetSharePct.value,
  }),
);

/**
 * The union resolved into display strings, so the template touches only fields
 * that exist for the rendered variant — vue-tsc does not narrow `result` across
 * sibling v-if/v-else, so the narrowing has to happen here.
 */
const view = computed(() => {
  const current = result.value;
  if (current.status === 'unreachable') return { kind: 'unreachable' as const };

  const shared = {
    kind: 'target' as const,
    currentShare: Math.round(current.currentGrowthSharePct),
    valueNeeded: formatBaseCurrency(current.portfolioValueNeeded),
    currentAmount: formatBaseCurrency(props.currentPortfolioValue),
  };

  if (current.status === 'reached') {
    return {
      ...shared,
      reached: true,
      progressPct: 100,
      gapText: t('netWorthDrivers.target.reached'),
      etaText: t('netWorthDrivers.target.etaReached'),
      showEtaHint: false,
    };
  }

  // Projected status always carries a strictly positive needed value, so the ratio is safe.
  const progressPct = Math.round(
    Math.min(Math.max((props.currentPortfolioValue / current.portfolioValueNeeded) * 100, 0), 100),
  );

  return {
    ...shared,
    reached: false,
    progressPct,
    gapText: t('netWorthDrivers.target.gapValue', { amount: formatBaseCurrency(current.gap) }),
    etaText: t('netWorthDrivers.target.etaValue', { years: formatYears(current.yearsToTarget) }),
    showEtaHint: true,
  };
});
</script>
