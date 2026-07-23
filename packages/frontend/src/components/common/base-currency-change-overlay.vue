<template>
  <BlockingJobOverlay
    :show-progress="showProgress"
    :is-taking-long="isTakingLong"
    :taking-long-label="$t('settings.currencies.setBase.overlay.takingLong')"
    :status-unreachable="statusUnreachable"
    :unreachable-title="$t('settings.currencies.setBase.overlay.unreachableTitle')"
    :unreachable-description="$t('settings.currencies.setBase.overlay.unreachableDescription')"
    :live-failure="liveFailure"
    :failed-title="$t('settings.currencies.setBase.overlay.failedTitle')"
    :dismiss-label="$t('settings.currencies.setBase.overlay.dismiss')"
    @dismiss="stop"
  >
    <template #progress>
      <!-- Hero: a slow ring spinning around a currency-swap badge signals live work. -->
      <div class="relative mx-auto flex size-16 items-center justify-center">
        <!-- Frozen mid-spin the ring reads as a broken circle, so drop it entirely
             under reduced motion — the badge alone stays clean. -->
        <Loader2Icon
          class="text-primary/30 animation-duration-[2.5s] absolute size-16 animate-spin motion-reduce:hidden"
          aria-hidden="true"
        />
        <div class="bg-primary/10 ring-primary/15 flex size-11 items-center justify-center rounded-full ring-1">
          <ArrowLeftRightIcon class="text-primary size-5" aria-hidden="true" />
        </div>
      </div>

      <h2 id="blocking-job-overlay-title" class="mt-5 text-lg font-semibold">
        {{ $t('settings.currencies.setBase.overlay.title') }}
      </h2>

      <p id="blocking-job-overlay-description" class="text-muted-foreground mt-2 text-sm">
        {{ $t('settings.currencies.setBase.overlay.description') }}
      </p>

      <!-- Progress: a determinate bar (solid = done, shimmering slice = in progress)
           plus the current step label and an "X of N" counter. -->
      <div class="mt-6">
        <div
          class="bg-primary/25 relative h-2 w-full overflow-hidden rounded-full"
          role="progressbar"
          :aria-valuemin="0"
          :aria-valuemax="totalSteps"
          :aria-valuenow="currentStepNumber ?? undefined"
          :aria-valuetext="counterText ?? undefined"
        >
          <div
            class="bg-primary absolute inset-y-0 left-0 transition-[width] duration-700 ease-out"
            :style="{ width: `${donePercent}%` }"
          />
          <div v-if="showSweep" class="bcc-sweep pointer-events-none absolute inset-0" aria-hidden="true" />
        </div>

        <div class="mt-3 flex items-center justify-between gap-3 text-sm">
          <span class="text-foreground flex min-w-0 items-center gap-2 font-medium">
            <CircleCheckIcon v-if="isFinishing" class="text-success-text size-4 shrink-0" aria-hidden="true" />
            <span v-else class="bg-primary size-1.5 shrink-0 animate-pulse rounded-full" aria-hidden="true" />
            <span class="truncate">{{ $t(currentLabelKey) }}</span>
          </span>

          <span v-if="counterText" class="text-muted-foreground shrink-0 text-xs tabular-nums">
            {{ counterText }}
          </span>
        </div>
      </div>
    </template>
  </BlockingJobOverlay>
</template>

<script setup lang="ts">
import BlockingJobOverlay from '@/components/common/blocking-job-overlay.vue';
import { useBaseCurrencyChangeStatus } from '@/composable/use-base-currency-change-status';
// Type-only: a runtime import of the shared step const can read as stale-undefined
// in the dockerized dev frontend until its container restarts.
import type { BaseCurrencyChangeStep } from '@bt/shared/types';
import { ArrowLeftRightIcon, CircleCheckIcon, Loader2Icon } from '@lucide/vue';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();
const { status, isBlocking, isTakingLong, liveFailure, statusUnreachable, stop } = useBaseCurrencyChangeStatus();

// Declared in the backend's execution order (see BASE_CURRENCY_CHANGE_STEPS) so its
// key order is the source for step numbering, and `satisfies` breaks the build if a
// backend step is added or renamed instead of silently rendering a raw i18n key.
const STEP_LABEL_KEYS = {
  transactions: 'settings.currencies.setBase.overlay.steps.transactions',
  accounts: 'settings.currencies.setBase.overlay.steps.accounts',
  loanDetails: 'settings.currencies.setBase.overlay.steps.loanDetails',
  balances: 'settings.currencies.setBase.overlay.steps.balances',
  investmentTransactions: 'settings.currencies.setBase.overlay.steps.investmentTransactions',
  portfolioTransfers: 'settings.currencies.setBase.overlay.steps.portfolioTransfers',
  holdings: 'settings.currencies.setBase.overlay.steps.holdings',
  portfolioBalances: 'settings.currencies.setBase.overlay.steps.portfolioBalances',
} satisfies Record<BaseCurrencyChangeStep, string>;

const STEP_ORDER = Object.keys(STEP_LABEL_KEYS) as BaseCurrencyChangeStep[];
const totalSteps = STEP_ORDER.length;

// Keep the progress card up through the brief `completed` window too: the terminal
// handler is wiping caches and about to reload, and dropping the overlay early would
// flash the underlying stale-base UI.
const showProgress = computed(() => isBlocking.value || status.value?.state === 'completed');

/**
 * Where the change is right now, mapped to what the bar shows:
 *  - `running`  → 0-based index of the step being processed (some done, one in flight)
 *  - `finishing`→ the brief `completed` window before the reload (bar full)
 *  - `preparing`→ queued, or running with no step yet (indeterminate bar)
 */
const progress = computed<
  { kind: 'running'; index: number; step: BaseCurrencyChangeStep } | { kind: 'finishing' } | { kind: 'preparing' }
>(() => {
  const current = status.value;
  if (current?.state === 'completed') return { kind: 'finishing' };
  if (current?.state === 'running' && current.step) {
    const index = STEP_ORDER.indexOf(current.step);
    if (index >= 0) return { kind: 'running', index, step: current.step };
  }
  return { kind: 'preparing' };
});

const isFinishing = computed(() => progress.value.kind === 'finishing');

// A white highlight sweeps the bar while work is in flight; the completed frame drops
// it and just shows the full fill.
const showSweep = computed(() => progress.value.kind !== 'finishing');

// Steps reported before the current one are done, so the fill is index/total: solid
// primary up to there, a dimmer primary track for what's left. `finishing` fills fully;
// `preparing` leaves the track empty with only the sweep, reading as indeterminate work.
const donePercent = computed(() => {
  const p = progress.value;
  if (p.kind === 'finishing') return 100;
  if (p.kind === 'running') return (p.index / totalSteps) * 100;
  return 0;
});

const currentStepNumber = computed(() => (progress.value.kind === 'running' ? progress.value.index + 1 : null));

const counterText = computed(() =>
  currentStepNumber.value == null
    ? null
    : t('settings.currencies.setBase.overlay.stepCounter', { current: currentStepNumber.value, total: totalSteps }),
);

const currentLabelKey = computed(() => {
  const p = progress.value;
  if (p.kind === 'running') return STEP_LABEL_KEYS[p.step];
  if (p.kind === 'finishing') return 'settings.currencies.setBase.overlay.finishing';
  return 'settings.currencies.setBase.overlay.preparing';
});
</script>

<style scoped>
/* A soft white highlight travelling left→right across the whole bar — signals the
   recalculation is actively progressing, on top of the determinate done/remaining fill. */
.bcc-sweep {
  background: linear-gradient(
    90deg,
    transparent,
    color-mix(in srgb, var(--color-primary-foreground) 24%, transparent),
    transparent
  );
  transform: translateX(-100%);
  animation: bcc-sweep 1.4s linear infinite;
}

@keyframes bcc-sweep {
  to {
    transform: translateX(100%);
  }
}

@media (prefers-reduced-motion: reduce) {
  .bcc-sweep {
    animation: none;
  }
}
</style>
