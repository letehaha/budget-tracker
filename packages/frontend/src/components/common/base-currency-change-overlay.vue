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
      <BlockingJobProgress
        :ordered-step-keys="STEP_ORDER"
        :step-label-keys="STEP_LABEL_KEYS"
        :state="progress.kind"
        :current-step-key="progress.kind === 'running' ? progress.step : null"
        preparing-label-key="settings.currencies.setBase.overlay.preparing"
        finishing-label-key="settings.currencies.setBase.overlay.finishing"
        :counter-text="counterText"
      >
        <template #icon>
          <ArrowLeftRightIcon class="text-primary size-5" aria-hidden="true" />
        </template>
        <template #title>{{ $t('settings.currencies.setBase.overlay.title') }}</template>
        <template #description>{{ $t('settings.currencies.setBase.overlay.description') }}</template>
        <template #trailing>
          <span v-if="counterText" class="text-muted-foreground shrink-0 text-xs tabular-nums">
            {{ counterText }}
          </span>
        </template>
      </BlockingJobProgress>
    </template>
  </BlockingJobOverlay>
</template>

<script setup lang="ts">
import BlockingJobOverlay from '@/components/common/blocking-job-overlay.vue';
import BlockingJobProgress from '@/components/common/blocking-job-progress.vue';
import { useBaseCurrencyChangeStatus } from '@/composable/use-base-currency-change-status';
import { ensureChunkLoaded } from '@/i18n';
// Type-only: a runtime import of the shared step const can read as stale-undefined
// in the dockerized dev frontend until its container restarts.
import type { BaseCurrencyChangeStep } from '@bt/shared/types';
import { ArrowLeftRightIcon } from '@lucide/vue';
import { computed, watch } from 'vue';
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

// This overlay lives at the app root and can surface on a non-settings route — e.g. a
// reload on the dashboard while a base-currency change runs. Its strings live in the
// `settings/currencies` i18n chunk, which only auto-loads under /settings, so pull it
// in the moment the overlay is about to show; a no-op once the chunk is already loaded.
watch(
  () => showProgress.value || liveFailure.value != null,
  (visible) => {
    if (visible) void ensureChunkLoaded('settings/currencies');
  },
  { immediate: true },
);

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

const currentStepNumber = computed(() => (progress.value.kind === 'running' ? progress.value.index + 1 : null));

const counterText = computed(() =>
  currentStepNumber.value == null
    ? null
    : t('settings.currencies.setBase.overlay.stepCounter', { current: currentStepNumber.value, total: totalSteps }),
);
</script>
