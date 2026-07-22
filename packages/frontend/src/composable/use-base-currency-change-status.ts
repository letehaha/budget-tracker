import { getBaseCurrencyChangeStatus } from '@/api/currencies';
import { useSSE } from '@/composable/use-sse';
import { AuthError } from '@/js/errors';
import { queryClient } from '@/lib/query-client';
import { resetQueryCaches } from '@/lib/query-persister';
import { captureException } from '@/lib/sentry';
import { SSE_EVENT_TYPES, type BaseCurrencyChangeStatus, type BaseCurrencyChangeStep } from '@bt/shared/types';
import { computed, ref } from 'vue';

const STATUS_POLL_INTERVAL_MS = 2000;
/** localStorage key holding the jobId of the last completion this browser already
 *  handled (wiped caches + reloaded for). Dedupes so a reload fires at most once per
 *  job per browser, whether the completion is seen live or first observed at boot. */
const HANDLED_JOB_STORAGE_KEY = 'base-currency-change-handled-job';
/** Consecutive poll failures before the overlay offers a manual escape hatch —
 *  ~20s at the 2s interval, long enough to ride out a brief backend blip. */
const MAX_POLL_FAILURES_BEFORE_UNREACHABLE = 10;
/** After this long on the same step the overlay adds a "still working" note but
 *  keeps blocking — the server lock is still held, so the change is not done. */
const TAKING_LONG_THRESHOLD_MS = 5 * 60 * 1000;

// Module-scoped singleton: at most one base-currency change runs per user, and
// its blocking overlay must be identical on every open screen, so every caller
// shares this state.

/** Latest status observed for the active change, or null when nothing is tracked. */
const status = ref<BaseCurrencyChangeStatus | null>(null);
/** Message from a change that failed while this device was watching live. Drives
 *  the dismissible error panel; never set for a terminal status first seen at boot. */
const liveFailure = ref<string | null>(null);
/** True once the active change has sat on one step past the taking-long threshold. */
const isTakingLong = ref(false);
/** True once the status poll has failed enough times in a row that the state can no
 *  longer be verified. Drives the overlay's dismissible escape hatch; a successful
 *  poll clears it, since a recovering server resumes normal progress. */
const statusUnreachable = ref(false);

/** Blocks the whole app while a change is queued or running. */
const isBlocking = computed(() => status.value?.state === 'queued' || status.value?.state === 'running');

// ---- Internal watchdog machinery — consumers never read these ----

let pollHandle: ReturnType<typeof setInterval> | null = null;
let unsubscribeSse: (() => void) | null = null;
/** Guards the terminal side effect so completion fires exactly once even if SSE
 *  and the poll deliver the terminal state in the same tick. */
let terminalHandled = false;
/** Timestamp of the last observed state/step change, for the taking-long timer. */
let lastProgressAt = 0;
/** Identity (state + step) of the last applied status, to detect real progress. */
let lastProgressKey = '';
/** True while the poll is in a run of consecutive failures, so a sustained outage
 *  reports to Sentry once rather than on every 2s tick. */
let pollFailing = false;
/** Count of consecutive poll failures, reset on the next success. Once it crosses
 *  the threshold the overlay surfaces the unreachable escape hatch. */
let consecutivePollFailures = 0;

function progressKey(next: BaseCurrencyChangeStatus): string {
  return next.state === 'running' ? `running:${next.step ?? ''}` : next.state;
}

/** True when this browser has already wiped+reloaded for the given completion. A
 *  storage read failure (private mode, quota) counts as handled so broken storage
 *  can never let the same completion trigger a reload loop. */
function isCompletionHandled({ jobId }: { jobId: string }): boolean {
  try {
    return localStorage.getItem(HANDLED_JOB_STORAGE_KEY) === jobId;
  } catch {
    return true;
  }
}

/** Records that this completion has been handled, so a later boot stays informational.
 *  Storage failures are swallowed — the marker is a best-effort loop guard. */
function markCompletionHandled({ jobId }: { jobId: string }): void {
  try {
    localStorage.setItem(HANDLED_JOB_STORAGE_KEY, jobId);
  } catch {
    // Storage unavailable: nothing to persist, callers already treat that as handled.
  }
}

/** Stops the poll loop and drops the SSE subscription, leaving overlay state intact. */
function clearTimers(): void {
  if (pollHandle) {
    clearInterval(pollHandle);
    pollHandle = null;
  }
  unsubscribeSse?.();
  unsubscribeSse = null;
}

/** Tears everything down and hides the overlay. Public: also the failure panel's dismiss. */
function stop(): void {
  clearTimers();
  terminalHandled = false;
  isTakingLong.value = false;
  statusUnreachable.value = false;
  consecutivePollFailures = 0;
  pollFailing = false;
  status.value = null;
  liveFailure.value = null;
}

/** Routes a terminal status to its side effect exactly once. */
async function handleTerminal(next: BaseCurrencyChangeStatus): Promise<void> {
  if (terminalHandled) return;
  terminalHandled = true;
  clearTimers();
  if (next.state === 'completed') {
    // Every cached monetary value was computed against the old base, so a full
    // cache wipe plus one reload is the only honest way to repaint them all. Reload
    // even if the wipe rejects — otherwise the app is left interactive on stale data.
    await resetQueryCaches(queryClient).catch((error) =>
      captureException({ error, context: { scope: 'base-currency-change-status:reset' } }),
    );
    // Mark before reloading so the post-reload boot sees this job as handled and
    // stays informational instead of wiping and reloading a second time.
    markCompletionHandled({ jobId: next.jobId });
    window.location.reload();
  } else if (next.state === 'failed') {
    liveFailure.value = next.error;
  }
}

/** Applies an observed status: tracks progress for the taking-long timer and fires
 *  the terminal handler on the first queued/running → completed/failed transition. */
function applyStatus(next: BaseCurrencyChangeStatus): void {
  const key = progressKey(next);
  if (key !== lastProgressKey) {
    lastProgressKey = key;
    lastProgressAt = Date.now();
    isTakingLong.value = false;
  }
  status.value = next;

  if (next.state === 'idle') {
    // The server reports nothing in progress (the job finished and aged out, or
    // its lock was reconciled). Nothing to reload — just drop the overlay.
    stop();
    return;
  }
  if (next.state === 'completed' || next.state === 'failed') {
    void handleTerminal(next);
  }
}

async function poll(): Promise<void> {
  try {
    applyStatus(await getBaseCurrencyChangeStatus());
    pollFailing = false;
    consecutivePollFailures = 0;
    statusUnreachable.value = false;
  } catch (error) {
    // A 401 means the global API handler already stopped this watchdog and logged
    // the user out — an expired session is not a poll outage worth reporting.
    if (error instanceof AuthError) return;
    // Keep polling: the server is still locked, so the overlay must stay up. Report
    // only the first failure of a streak — a sustained outage otherwise floods Sentry
    // with a fresh event every 2s.
    if (!pollFailing) {
      pollFailing = true;
      captureException({ error, context: { scope: 'base-currency-change-status:poll' } });
    }
    consecutivePollFailures += 1;
    if (consecutivePollFailures >= MAX_POLL_FAILURES_BEFORE_UNREACHABLE) {
      // The status endpoint has been down long enough that we can't confirm the
      // change is still running. Offer a manual escape so the user isn't locked out;
      // polling continues, so a recovering server clears this on the next success.
      statusUnreachable.value = true;
    }
  }
}

/** Starts the live watchdog: an unconditional 2s poll — the delivery guarantee —
 *  plus an SSE listener that only fires when another feature already holds a
 *  connection open (SSE is a lazy shared singleton, so it is a bonus, never relied on). */
function beginWatch({ seed }: { seed?: BaseCurrencyChangeStatus } = {}): void {
  clearTimers();
  terminalHandled = false;
  pollFailing = false;
  consecutivePollFailures = 0;
  isTakingLong.value = false;
  statusUnreachable.value = false;
  liveFailure.value = null;
  lastProgressKey = '';
  lastProgressAt = Date.now();

  // Seed a blocking placeholder so the overlay appears instantly; the first poll
  // replaces it with the real state within one tick.
  status.value = seed ?? { state: 'queued', jobId: '' };

  unsubscribeSse = useSSE().on(SSE_EVENT_TYPES.BASE_CURRENCY_CHANGE_STATUS, (payload) => applyStatus(payload));

  void poll();
  pollHandle = setInterval(() => {
    if (isBlocking.value && Date.now() - lastProgressAt >= TAKING_LONG_THRESHOLD_MS) {
      isTakingLong.value = true;
    }
    void poll();
  }, STATUS_POLL_INTERVAL_MS);
}

/**
 * Begins tracking a change this device knows is in flight — the initiator's 202,
 * or a 423 kicked from the global API handler. Any prior watch is torn down first.
 */
function start(params?: { initialStatus?: BaseCurrencyChangeStatus }): void {
  beginWatch({ seed: params?.initialStatus });
}

/**
 * Fetches the status once at app boot and drives the right side effect. A change in
 * flight attaches the live watchdog. A `completed` this browser has not yet handled
 * (it was closed or hard-refreshed while the change ran) wipes caches and reloads
 * once — the persisted monetary data was computed against the old base. The handled-
 * job marker guarantees that reload fires at most once per job per browser, so the
 * retained-24h completion cannot loop. `failed` at boot changed no data, so it is
 * informational only.
 */
async function checkOnBoot(): Promise<void> {
  try {
    const next = await getBaseCurrencyChangeStatus();
    if (next.state === 'queued' || next.state === 'running') {
      beginWatch({ seed: next });
      return;
    }
    if (next.state === 'completed' && !isCompletionHandled({ jobId: next.jobId })) {
      await resetQueryCaches(queryClient).catch((error) =>
        captureException({ error, context: { scope: 'base-currency-change-status:reset' } }),
      );
      markCompletionHandled({ jobId: next.jobId });
      window.location.reload();
    }
  } catch (error) {
    // Boot status is best-effort; a failure here must not block app initialization.
    captureException({ error, context: { scope: 'base-currency-change-status:boot' } });
  }
}

/**
 * Shared SSE + status-poll watchdog for the base-currency change job. Polling is
 * the delivery guarantee (SSE is a bonus channel that may never connect); the
 * terminal handler is idempotent and fires on the first observed terminal state.
 */
export function useBaseCurrencyChangeStatus() {
  return {
    /** Read-only to callers — the composable owns every write. */
    status,
    isBlocking,
    isTakingLong,
    liveFailure,
    statusUnreachable,
    start,
    stop,
    checkOnBoot,
  };
}

// ---- Dev-only overlay driver ----
// Preview the blocking overlay in a running dev build without starting a real (heavy,
// irreversible) base-currency change or touching the backend. Seeds the shared status
// while suppressing the poll/SSE watchdog and the terminal cache-wipe+reload, so nothing
// hits the network or navigates. Stripped from production bundles by the DEV guard.
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
  let devTimer: ReturnType<typeof setInterval> | null = null;
  const stopDevTimer = () => {
    if (devTimer) {
      clearInterval(devTimer);
      devTimer = null;
    }
  };
  const setMockStatus = (next: BaseCurrencyChangeStatus | null) => {
    clearTimers();
    terminalHandled = true;
    isTakingLong.value = false;
    statusUnreachable.value = false;
    liveFailure.value = null;
    status.value = next;
  };
  (window as unknown as { __baseCurrencyOverlay?: unknown }).__baseCurrencyOverlay = {
    play(intervalMs = 1500) {
      stopDevTimer();
      let i = 0;
      setMockStatus({ state: 'running', jobId: 'dev-mock', step: DEV_STEPS[i] });
      devTimer = setInterval(() => {
        i = (i + 1) % DEV_STEPS.length;
        status.value = { state: 'running', jobId: 'dev-mock', step: DEV_STEPS[i] };
      }, intervalMs);
    },
    step(name: BaseCurrencyChangeStep) {
      stopDevTimer();
      setMockStatus({ state: 'running', jobId: 'dev-mock', step: name });
    },
    queued() {
      stopDevTimer();
      setMockStatus({ state: 'queued', jobId: 'dev-mock' });
    },
    finishing() {
      stopDevTimer();
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
      stopDevTimer();
      setMockStatus(null);
      liveFailure.value = message;
    },
    hide() {
      stopDevTimer();
      stop();
    },
  };
}
