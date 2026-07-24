import { getBaseCurrencyChangeStatus } from '@/api/currencies';
import {
  type BlockingJobWatchdog,
  createBlockingJobWatchdog,
} from '@/composable/blocking-job-watchdog/create-blocking-job-watchdog';
import { SSE_EVENT_TYPES, type BaseCurrencyChangeStatus, type BaseCurrencyChangeStep } from '@bt/shared/types';

// Built lazily on first use, not at module top level: this composable sits in the
// api ↔ store import cycle, and a synchronous factory call during that cycle can run
// the factory body before its own `vue` import has initialized (temporal dead zone).
// Deferring to first call means the watchdog is created after the graph has loaded.
let watchdog: BlockingJobWatchdog<BaseCurrencyChangeStatus> | null = null;

// Singleton: at most one base-currency change runs per user, and its blocking overlay
// must be identical on every open screen, so every caller shares this watchdog. The
// generic machinery (poll-as-guarantee + SSE bonus, taking-long timer, unreachable
// escape hatch, once-only wipe+reload, boot reconciliation) lives in the shared
// factory; only the status source and dedup key are base-currency's.
function getWatchdog(): BlockingJobWatchdog<BaseCurrencyChangeStatus> {
  if (!watchdog) {
    watchdog = createBlockingJobWatchdog<BaseCurrencyChangeStatus, typeof SSE_EVENT_TYPES.BASE_CURRENCY_CHANGE_STATUS>({
      scope: 'base-currency-change-status',
      handledJobStorageKey: 'base-currency-change-handled-job',
      fetchStatus: getBaseCurrencyChangeStatus,
      sse: {
        event: SSE_EVENT_TYPES.BASE_CURRENCY_CHANGE_STATUS,
        // The SSE payload for this event already IS the status shape.
        toStatus: (payload) => payload,
      },
    });
  }
  return watchdog;
}

/**
 * Shared SSE + status-poll watchdog for the base-currency change job. Polling is
 * the delivery guarantee (SSE is a bonus channel that may never connect); the
 * terminal handler is idempotent and fires on the first observed terminal state.
 */
export function useBaseCurrencyChangeStatus() {
  return getWatchdog();
}

// ---- Dev-only overlay driver ----
// Preview the blocking overlay in a running dev build without starting a real (heavy,
// irreversible) base-currency change or touching the backend. It drives the shared
// status ref directly, so the poll/SSE watchdog and the terminal cache-wipe+reload
// never run (assigning `status` doesn't route through the watchdog's side effects).
// Stripped from production bundles by the DEV guard.
// From the browser console:
//   __baseCurrencyOverlay.play()                 // auto-advance all 8 steps on a loop
//   __baseCurrencyOverlay.step('holdings')       // jump to one step
//   __baseCurrencyOverlay.queued()               // pre-step "getting ready" frame
//   __baseCurrencyOverlay.finishing()            // brief "completed" frame (no reload)
//   __baseCurrencyOverlay.takingLong()           // add the "taking longer" note
//   __baseCurrencyOverlay.unreachable()          // show the dismissible escape hatch
//   __baseCurrencyOverlay.fail('boom')           // failure panel
//   __baseCurrencyOverlay.hide()                 // dismiss
if (import.meta.env.DEV) {
  const DEV_STEPS: BaseCurrencyChangeStep[] = [
    'transactions',
    'accounts',
    'loanDetails',
    'balances',
    'investmentTransactions',
    'portfolioTransfers',
    'holdings',
    'portfolioBalances',
  ];
  const { status, isTakingLong, statusUnreachable, liveFailure, stop } = getWatchdog();
  let devTimer: ReturnType<typeof setInterval> | null = null;
  const stopDevTimer = () => {
    if (devTimer) {
      clearInterval(devTimer);
      devTimer = null;
    }
  };
  const setMockStatus = (next: BaseCurrencyChangeStatus | null) => {
    stopDevTimer();
    isTakingLong.value = false;
    statusUnreachable.value = false;
    liveFailure.value = null;
    status.value = next;
  };
  (window as unknown as { __baseCurrencyOverlay?: unknown }).__baseCurrencyOverlay = {
    play(intervalMs = 1500) {
      let i = 0;
      setMockStatus({ state: 'running', jobId: 'dev-mock', step: DEV_STEPS[i] });
      devTimer = setInterval(() => {
        i = (i + 1) % DEV_STEPS.length;
        status.value = { state: 'running', jobId: 'dev-mock', step: DEV_STEPS[i] };
      }, intervalMs);
    },
    step(name: BaseCurrencyChangeStep) {
      setMockStatus({ state: 'running', jobId: 'dev-mock', step: name });
    },
    queued() {
      setMockStatus({ state: 'queued', jobId: 'dev-mock' });
    },
    finishing() {
      setMockStatus({
        state: 'completed',
        jobId: 'dev-mock',
        finishedAt: 0,
        result: {
          transactionsUpdated: 0,
          accountsUpdated: 0,
          loanDetailsUpdated: 0,
          balancesRebuilt: 0,
          investmentTransactionsUpdated: 0,
          portfolioTransfersUpdated: 0,
          holdingsUpdated: 0,
          portfolioBalancesUpdated: 0,
        },
      });
    },
    takingLong() {
      isTakingLong.value = true;
    },
    unreachable() {
      statusUnreachable.value = true;
    },
    fail(message = 'Simulated base-currency change failure (dev preview).') {
      setMockStatus(null);
      liveFailure.value = message;
    },
    hide() {
      stopDevTimer();
      stop();
    },
  };
}
