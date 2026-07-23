import { useNotificationCenter } from '@/components/notification-center';
import { useSSE } from '@/composable/use-sse';
import { i18n } from '@/i18n';
import { AuthError } from '@/js/errors';
import { queryClient } from '@/lib/query-client';
import { resetQueryCaches } from '@/lib/query-persister';
import { captureException } from '@/lib/sentry';
import type { SSEEventPayloadMap } from '@bt/shared/types';
import { type ComputedRef, type Ref, computed, ref } from 'vue';

/**
 * A destructive background job (base-currency change, data restore, …) runs
 * server-side, holds a write-lock, and rewrites data every open tab has cached.
 * Any device must be able to learn one is in flight — including after a reload —
 * block the whole UI until it lands, then wipe caches and reload once so nothing
 * acts on pre-job data. This factory is that watchdog, shared by every such job.
 *
 * Polling is the delivery guarantee (a 2s status poll of a never-404 endpoint);
 * SSE is a bonus channel that may never connect. The terminal handler is
 * idempotent and fires on the first observed terminal state, whether via SSE, the
 * live poll, or the boot check.
 */

export type BlockingJobState = 'idle' | 'queued' | 'running' | 'completed' | 'failed';

/** Minimum contract every job's status must satisfy to plug into the watchdog. */
export interface BlockingJobStatusBase {
  state: BlockingJobState;
  /** Present on every non-idle state; identifies the job for completion dedup. */
  jobId?: string;
  /** Failure reason when `state === 'failed'`. */
  error?: string;
}

export interface BlockingJobWatchdog<TStatus extends BlockingJobStatusBase> {
  /** Latest status observed, or null when nothing is tracked. Read-only to callers. */
  status: Ref<TStatus | null>;
  /** Blocks the whole app while the job is queued or running. */
  isBlocking: ComputedRef<boolean>;
  /** True once the job has sat on one progress step past the taking-long threshold. */
  isTakingLong: Ref<boolean>;
  /** Message from a job that failed while this device watched live. */
  liveFailure: Ref<string | null>;
  /** True once the poll has failed enough times in a row that state can't be verified. */
  statusUnreachable: Ref<boolean>;
  /** Begin tracking a job this device knows is in flight (initiator, or a 423 kick). */
  start: (params?: { initialStatus?: TStatus }) => void;
  /** Tear everything down and hide the overlay. Also the failure panel's dismiss. */
  stop: () => void;
  /** Fetch status once at boot and drive the right side effect (watch / wipe+reload). */
  checkOnBoot: () => Promise<void>;
  /** Record a job outcome this browser already reconciled, so a later boot stays quiet. */
  markHandled: (params: { jobId: string }) => void;
}

interface BlockingJobWatchdogConfig<TStatus extends BlockingJobStatusBase, TEvent extends keyof SSEEventPayloadMap> {
  /** Sentry scope + log label, e.g. `base-currency-change-status`. */
  scope: string;
  /** localStorage key holding the last job (completed-and-reloaded, or
   *  failed-and-notified) this browser already reconciled. */
  handledJobStorageKey: string;
  /** Fetch the user's current status. MUST never 404 — "nothing running" is `idle`. */
  fetchStatus: () => Promise<TStatus>;
  /** Optional bonus SSE channel; its payload is mapped into `TStatus`. */
  sse?: {
    event: TEvent;
    toStatus: (payload: SSEEventPayloadMap[TEvent]) => TStatus | null;
  };
  /**
   * Side effect on the first-observed `completed`. Defaults to a full cache wipe +
   * one page reload (the only honest way to repaint data computed against old
   * state). An override still owns marking the job handled if it suppresses reload.
   */
  onCompleted?: (status: TStatus) => Promise<void> | void;
  /** What "progress advanced" means, for the taking-long timer. Defaults to any
   *  change in the serialized status (step, phase, counter — all count as progress). */
  progressKey?: (status: TStatus) => string;
  pollIntervalMs?: number;
  takingLongThresholdMs?: number;
  maxPollFailuresBeforeUnreachable?: number;
}

const DEFAULT_POLL_INTERVAL_MS = 2000;
/** Consecutive poll failures before the overlay offers a manual escape hatch —
 *  ~20s at the default interval, long enough to ride out a brief backend blip. */
const DEFAULT_MAX_POLL_FAILURES = 10;
/** After this long on the same step the overlay adds a "still working" note but
 *  keeps blocking — the server lock is still held, so the job is not done. */
const DEFAULT_TAKING_LONG_THRESHOLD_MS = 5 * 60 * 1000;

/**
 * Build a module-singleton watchdog for one kind of blocking background job. Call
 * once at the top level of a per-job composable module and share the result — at
 * most one such job runs per user, and its overlay must be identical on every open
 * screen, so every caller reads the same state.
 */
export function createBlockingJobWatchdog<
  TStatus extends BlockingJobStatusBase,
  TEvent extends keyof SSEEventPayloadMap,
>(config: BlockingJobWatchdogConfig<TStatus, TEvent>): BlockingJobWatchdog<TStatus> {
  // The DEFAULT_* fallbacks are read lazily at their use sites (inside poll/beginWatch,
  // which run only after boot), never hoisted into consts here. A consumer calls this
  // factory at its module top level, which can execute mid circular import
  // (_api.ts → base-currency watchdog → this file), and a synchronous read of a
  // module-level DEFAULT_* const at that moment hits its temporal dead zone.
  const computeProgressKey = config.progressKey ?? ((status: TStatus) => JSON.stringify(status));

  const status = ref<TStatus | null>(null) as Ref<TStatus | null>;
  const liveFailure = ref<string | null>(null);
  const isTakingLong = ref(false);
  const statusUnreachable = ref(false);

  const isBlocking = computed(() => status.value?.state === 'queued' || status.value?.state === 'running');

  // ---- Internal watchdog machinery — consumers never read these ----

  let pollHandle: ReturnType<typeof setInterval> | null = null;
  let unsubscribeSse: (() => void) | null = null;
  /** Guards the terminal side effect so completion fires exactly once even if SSE
   *  and the poll deliver the terminal state in the same tick. */
  let terminalHandled = false;
  /** Timestamp of the last observed progress change, for the taking-long timer. */
  let lastProgressAt = 0;
  /** Identity of the last applied status, to detect real progress. */
  let lastProgressKey = '';
  /** True while the poll is in a run of consecutive failures, so a sustained outage
   *  reports to Sentry once rather than on every tick. */
  let pollFailing = false;
  /** Count of consecutive poll failures, reset on the next success. */
  let consecutivePollFailures = 0;

  /** True when this browser has already reconciled the given job (reload for a
   *  completion, or notification for a boot-observed failure). A storage read
   *  failure (private mode, quota) counts as handled so broken storage can never
   *  let the same outcome trigger a reload/notification loop. */
  function isJobHandled({ jobId }: { jobId: string }): boolean {
    try {
      return localStorage.getItem(config.handledJobStorageKey) === jobId;
    } catch {
      return true;
    }
  }

  function markHandled({ jobId }: { jobId: string }): void {
    try {
      localStorage.setItem(config.handledJobStorageKey, jobId);
    } catch {
      // Storage unavailable: nothing to persist, callers already treat that as handled.
    }
  }

  function clearTimers(): void {
    if (pollHandle) {
      clearInterval(pollHandle);
      pollHandle = null;
    }
    unsubscribeSse?.();
    unsubscribeSse = null;
  }

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

  /** The default terminal side effect: wipe every cache and reload once. Every
   *  cached value was computed against pre-job state, so a full wipe plus one
   *  reload is the only honest way to repaint them. Reload even if the wipe rejects
   *  — otherwise the app is left interactive on stale data. */
  async function defaultOnCompleted(next: TStatus): Promise<void> {
    await resetQueryCaches(queryClient).catch((error) =>
      captureException({ error, context: { scope: `${config.scope}:reset` } }),
    );
    // Mark before reloading so the post-reload boot sees this job as handled and
    // stays informational instead of wiping and reloading a second time.
    if (next.jobId) markHandled({ jobId: next.jobId });
    window.location.reload();
  }

  async function runCompleted(next: TStatus): Promise<void> {
    await (config.onCompleted ? config.onCompleted(next) : defaultOnCompleted(next));
  }

  /** Routes a terminal status to its side effect exactly once. */
  async function handleTerminal(next: TStatus): Promise<void> {
    if (terminalHandled) return;
    terminalHandled = true;
    clearTimers();
    if (next.state === 'completed') {
      await runCompleted(next);
    } else if (next.state === 'failed') {
      liveFailure.value = next.error ?? null;
    }
  }

  /** Applies an observed status: tracks progress for the taking-long timer and fires
   *  the terminal handler on the first queued/running → completed/failed transition. */
  function applyStatus(next: TStatus): void {
    const key = computeProgressKey(next);
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
      applyStatus(await config.fetchStatus());
      pollFailing = false;
      consecutivePollFailures = 0;
      statusUnreachable.value = false;
    } catch (error) {
      // A 401 means the global API handler already stopped this watchdog and logged
      // the user out — an expired session is not a poll outage worth reporting.
      if (error instanceof AuthError) return;
      // Keep polling: the server is still locked, so the overlay must stay up. Report
      // only the first failure of a streak — a sustained outage otherwise floods
      // Sentry with a fresh event every tick.
      if (!pollFailing) {
        pollFailing = true;
        captureException({ error, context: { scope: `${config.scope}:poll` } });
      }
      consecutivePollFailures += 1;
      if (consecutivePollFailures >= (config.maxPollFailuresBeforeUnreachable ?? DEFAULT_MAX_POLL_FAILURES)) {
        // The status endpoint has been down long enough that we can't confirm the
        // job is still running. Offer a manual escape so the user isn't locked out;
        // polling continues, so a recovering server clears this on the next success.
        statusUnreachable.value = true;
      }
    }
  }

  /** Starts the live watchdog: an unconditional poll — the delivery guarantee — plus
   *  an SSE listener that only fires when another feature already holds a connection
   *  open (SSE is a lazy shared singleton, so it is a bonus, never relied on). */
  function beginWatch({ seed }: { seed?: TStatus } = {}): void {
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
    // replaces it with the real state (with the jobId) within one tick.
    status.value = seed ?? ({ state: 'queued' } as unknown as TStatus);

    if (config.sse) {
      const { event, toStatus } = config.sse;
      unsubscribeSse = useSSE().on(event, (payload) => {
        const mapped = toStatus(payload);
        if (mapped) applyStatus(mapped);
      });
    }

    void poll();
    pollHandle = setInterval(() => {
      if (
        isBlocking.value &&
        Date.now() - lastProgressAt >= (config.takingLongThresholdMs ?? DEFAULT_TAKING_LONG_THRESHOLD_MS)
      ) {
        isTakingLong.value = true;
      }
      void poll();
    }, config.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS);
  }

  function start(params?: { initialStatus?: TStatus }): void {
    beginWatch({ seed: params?.initialStatus });
  }

  /**
   * Fetches status once at boot and drives the right side effect. A job in flight
   * attaches the live watchdog. A `completed` this browser has not yet reconciled
   * (it was closed or hard-refreshed while the job ran) wipes caches and reloads
   * once — its persisted data was computed against pre-job state. The handled-job
   * marker guarantees that reload fires at most once per job per browser, so the
   * retained completion cannot loop. `failed` at boot changed no data (the job
   * rolled back), so there's nothing to reload — but the user who closed the tab
   * never saw it fail, so it gets a one-time toast instead, deduped the same way.
   */
  async function checkOnBoot(): Promise<void> {
    try {
      const next = await config.fetchStatus();
      if (next.state === 'queued' || next.state === 'running') {
        beginWatch({ seed: next });
        return;
      }
      if (next.state === 'completed' && next.jobId && !isJobHandled({ jobId: next.jobId })) {
        await runCompleted(next);
      }
      if (next.state === 'failed' && next.jobId && !isJobHandled({ jobId: next.jobId })) {
        markHandled({ jobId: next.jobId });
        useNotificationCenter().addErrorNotification(
          i18n.global.t('common.notifications.backgroundJobFailed', { error: next.error ?? '' }),
        );
      }
    } catch (error) {
      // Boot status is best-effort; a failure here must not block app initialization.
      captureException({ error, context: { scope: `${config.scope}:boot` } });
    }
  }

  return {
    status,
    isBlocking,
    isTakingLong,
    liveFailure,
    statusUnreachable,
    start,
    stop,
    checkOnBoot,
    markHandled,
  };
}
