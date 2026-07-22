import { AuthError } from '@/js/errors';
import { API_ERROR_CODES, type BaseCurrencyChangeStatus, type BaseCurrencyChangeStep } from '@bt/shared/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getStatusMock, resetQueryCachesMock, captureExceptionMock, sseOnMock, reloadMock } = vi.hoisted(() => ({
  getStatusMock: vi.fn(),
  resetQueryCachesMock: vi.fn(),
  captureExceptionMock: vi.fn(),
  sseOnMock: vi.fn(),
  reloadMock: vi.fn(),
}));

vi.mock('@/api/currencies', () => ({ getBaseCurrencyChangeStatus: getStatusMock }));
vi.mock('@/lib/query-persister', () => ({ resetQueryCaches: resetQueryCachesMock }));
vi.mock('@/lib/query-client', () => ({ queryClient: {} }));
vi.mock('@/lib/sentry', () => ({ captureException: captureExceptionMock }));
vi.mock('@/composable/use-sse', () => ({ useSSE: () => ({ on: sseOnMock }) }));

import { useBaseCurrencyChangeStatus } from './use-base-currency-change-status';

const queued = (jobId = 'job-1'): BaseCurrencyChangeStatus => ({ state: 'queued', jobId });
const running = (step: BaseCurrencyChangeStep, jobId = 'job-1'): BaseCurrencyChangeStatus => ({
  state: 'running',
  jobId,
  step,
});
const completed = (jobId = 'job-1'): BaseCurrencyChangeStatus => ({
  state: 'completed',
  jobId,
  finishedAt: Date.now(),
  result: {
    transactionsUpdated: 1,
    accountsUpdated: 1,
    loanDetailsUpdated: 0,
    balancesRebuilt: 0,
    investmentTransactionsUpdated: 0,
    portfolioTransfersUpdated: 0,
    holdingsUpdated: 0,
    portfolioBalancesUpdated: 0,
  },
});
const failed = (error: string, jobId = 'job-1'): BaseCurrencyChangeStatus => ({ state: 'failed', jobId, error });

/** localStorage key the composable uses to dedupe completion handling per browser. */
const HANDLED_JOB_KEY = 'base-currency-change-handled-job';

/** In-memory localStorage stand-in; each spy is overridable per test (e.g. to throw). */
const makeStorageMock = () => {
  const store = new Map<string, string>();
  return {
    getItem: vi.fn((key: string): string | null => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string): void => void store.set(key, value)),
    removeItem: vi.fn((key: string): void => void store.delete(key)),
    clear: vi.fn((): void => store.clear()),
  };
};
let storageMock: ReturnType<typeof makeStorageMock>;

/** Latest SSE callback registered by the composable's live watch. */
const latestSseCallback = (): ((payload: BaseCurrencyChangeStatus) => void) =>
  sseOnMock.mock.calls[sseOnMock.mock.calls.length - 1]![1];

describe('useBaseCurrencyChangeStatus', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetQueryCachesMock.mockResolvedValue(undefined);
    sseOnMock.mockReturnValue(() => {});
    storageMock = makeStorageMock();
    vi.stubGlobal('location', { reload: reloadMock });
    vi.stubGlobal('localStorage', storageMock);
  });

  afterEach(() => {
    useBaseCurrencyChangeStatus().stop();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('blocks while queued/running and resets caches + reloads once on a live completion', async () => {
    getStatusMock.mockResolvedValueOnce(running('accounts')).mockResolvedValueOnce(completed());

    const store = useBaseCurrencyChangeStatus();
    store.start({ initialStatus: queued() });

    expect(store.isBlocking.value).toBe(true);

    // First poll: still running. Second poll: completed → terminal side effects.
    await vi.advanceTimersByTimeAsync(0);
    expect(store.status.value?.state).toBe('running');
    expect(reloadMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(2000);

    expect(resetQueryCachesMock).toHaveBeenCalledTimes(1);
    expect(reloadMock).toHaveBeenCalledTimes(1);
    // The marker is written before the reload so the post-reload boot stays informational.
    expect(storageMock.setItem).toHaveBeenCalledWith(HANDLED_JOB_KEY, 'job-1');
  });

  it('fires the terminal side effect exactly once when SSE and the poll both deliver completed', async () => {
    getStatusMock.mockResolvedValue(completed());

    const store = useBaseCurrencyChangeStatus();
    store.start({ initialStatus: queued() });

    // SSE delivers the terminal state first.
    latestSseCallback()(completed());
    await vi.advanceTimersByTimeAsync(0);

    // The poll then also returns completed; the guard must suppress a second run.
    await vi.advanceTimersByTimeAsync(2000);

    expect(reloadMock).toHaveBeenCalledTimes(1);
    expect(resetQueryCachesMock).toHaveBeenCalledTimes(1);
  });

  it('wipes caches, writes the handled-job marker and reloads once for an unhandled completion at boot', async () => {
    // A device closed/hard-refreshed mid-change boots after completion: its persisted
    // monetary data was computed against the old base, so it must wipe + reload.
    getStatusMock.mockResolvedValue(completed());

    const store = useBaseCurrencyChangeStatus();
    await store.checkOnBoot();

    expect(resetQueryCachesMock).toHaveBeenCalledTimes(1);
    expect(storageMock.setItem).toHaveBeenCalledWith(HANDLED_JOB_KEY, 'job-1');
    expect(reloadMock).toHaveBeenCalledTimes(1);
  });

  it('treats an already-handled completion at boot as informational — no wipe, no reload', async () => {
    // The marker already names this job (this browser reloaded for it before), so the
    // retained-24h completion must not loop.
    storageMock.getItem.mockReturnValue('job-1');
    getStatusMock.mockResolvedValue(completed());

    const store = useBaseCurrencyChangeStatus();
    await store.checkOnBoot();

    expect(resetQueryCachesMock).not.toHaveBeenCalled();
    expect(reloadMock).not.toHaveBeenCalled();
    expect(store.isBlocking.value).toBe(false);
  });

  it('does not reload for a boot completion when localStorage access throws', async () => {
    // Broken storage (private mode/quota) counts as handled, so it can never drive a loop.
    storageMock.getItem.mockImplementation(() => {
      throw new Error('storage disabled');
    });
    getStatusMock.mockResolvedValue(completed());

    const store = useBaseCurrencyChangeStatus();
    await store.checkOnBoot();

    expect(reloadMock).not.toHaveBeenCalled();
    expect(resetQueryCachesMock).not.toHaveBeenCalled();
  });

  it('attaches the live watch when a change is in flight at boot, then reloads on completion', async () => {
    // Boot fetch + the immediate live poll both see it still running; the change
    // only completes on the timer-driven poll, so the overlay is up meanwhile.
    getStatusMock
      .mockResolvedValueOnce(running('transactions'))
      .mockResolvedValueOnce(running('accounts'))
      .mockResolvedValueOnce(completed());

    const store = useBaseCurrencyChangeStatus();
    await store.checkOnBoot();

    expect(store.isBlocking.value).toBe(true);

    await vi.advanceTimersByTimeAsync(2000);

    expect(reloadMock).toHaveBeenCalledTimes(1);
  });

  it('still reloads on a live completion when the cache wipe rejects', async () => {
    getStatusMock.mockResolvedValueOnce(completed());
    resetQueryCachesMock.mockRejectedValueOnce(new Error('indexeddb blocked'));

    const store = useBaseCurrencyChangeStatus();
    store.start({ initialStatus: queued() });

    await vi.advanceTimersByTimeAsync(0);

    expect(reloadMock).toHaveBeenCalledTimes(1);
    expect(captureExceptionMock).toHaveBeenCalledTimes(1);
  });

  it('reports a sustained poll outage to Sentry once, not on every tick', async () => {
    getStatusMock.mockRejectedValue(new Error('status endpoint down'));

    const store = useBaseCurrencyChangeStatus();
    store.start({ initialStatus: queued() });

    // Immediate poll + several interval polls all fail; only the first is reported.
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(2000);
    await vi.advanceTimersByTimeAsync(2000);
    await vi.advanceTimersByTimeAsync(2000);

    expect(captureExceptionMock).toHaveBeenCalledTimes(1);
    expect(store.isBlocking.value).toBe(true);
  });

  it('never reports an auth-expired poll to Sentry — the API handler already handled it', async () => {
    getStatusMock.mockRejectedValue(new AuthError({ code: API_ERROR_CODES.unauthorized, message: 'expired' }));

    const store = useBaseCurrencyChangeStatus();
    store.start({ initialStatus: queued() });

    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(2000);

    expect(captureExceptionMock).not.toHaveBeenCalled();
  });

  it('exposes an escape hatch after a sustained poll outage and clears it on recovery', async () => {
    getStatusMock.mockRejectedValue(new Error('status endpoint down'));

    const store = useBaseCurrencyChangeStatus();
    store.start({ initialStatus: queued() });

    // Immediate poll + nine interval polls = ten consecutive failures.
    await vi.advanceTimersByTimeAsync(0);
    for (let i = 0; i < 9; i += 1) {
      await vi.advanceTimersByTimeAsync(2000);
    }

    expect(store.statusUnreachable.value).toBe(true);
    expect(store.isBlocking.value).toBe(true);

    // A recovering server answers again; the next successful poll clears the flag.
    getStatusMock.mockResolvedValue(running('accounts'));
    await vi.advanceTimersByTimeAsync(2000);

    expect(store.statusUnreachable.value).toBe(false);
    expect(store.isBlocking.value).toBe(true);
  });

  it('flags a stalled step as taking long and clears the flag when the step advances', async () => {
    getStatusMock.mockResolvedValue(running('accounts'));

    const store = useBaseCurrencyChangeStatus();
    store.start({ initialStatus: queued() });

    // The step never changes for the whole threshold window.
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);

    expect(store.isTakingLong.value).toBe(true);
    expect(store.isBlocking.value).toBe(true);

    // Real progress on the next poll resets the stall timer.
    getStatusMock.mockResolvedValue(running('balances'));
    await vi.advanceTimersByTimeAsync(2000);

    expect(store.isTakingLong.value).toBe(false);
  });

  it('shows the failure panel on a live failure without wiping caches', async () => {
    getStatusMock.mockResolvedValueOnce(failed('drain timed out'));

    const store = useBaseCurrencyChangeStatus();
    store.start({ initialStatus: queued() });

    await vi.advanceTimersByTimeAsync(0);

    expect(store.liveFailure.value).toBe('drain timed out');
    expect(store.isBlocking.value).toBe(false);
    expect(reloadMock).not.toHaveBeenCalled();
    expect(resetQueryCachesMock).not.toHaveBeenCalled();
  });

  it('drops the overlay when the server reports idle', async () => {
    getStatusMock.mockResolvedValueOnce({ state: 'idle' } as BaseCurrencyChangeStatus);

    const store = useBaseCurrencyChangeStatus();
    store.start({ initialStatus: queued() });

    await vi.advanceTimersByTimeAsync(0);

    expect(store.status.value).toBeNull();
    expect(store.isBlocking.value).toBe(false);
    expect(reloadMock).not.toHaveBeenCalled();
  });
});
