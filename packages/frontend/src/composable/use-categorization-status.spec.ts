import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAiCategorizationStatus = vi.fn();
const invalidateQueries = vi.fn();
const addNotification = vi.fn();

// Captures the handler `subscribeToSSE` registers, so a test can play a live event.
const sse = vi.hoisted(() => ({ handlers: [] as Array<(data: unknown) => void> }));

vi.mock('@/api/ai-categorization', () => ({
  getAiCategorizationStatus: (...args: unknown[]) => getAiCategorizationStatus(...args),
}));

vi.mock('./use-sse', () => ({
  SSE_EVENT_TYPES: { AI_CATEGORIZATION_PROGRESS: 'ai_categorization_progress' },
  useSSE: () => ({
    connect: vi.fn(),
    on: vi.fn((_event: string, handler: (data: unknown) => void) => {
      sse.handlers.push(handler);
      return () => {};
    }),
    isConnected: { value: true },
  }),
}));

vi.mock('@/common/const', () => ({
  VUE_QUERY_GLOBAL_PREFIXES: { transactionChange: 'transactionChange' },
}));

vi.mock('@/components/notification-center', () => ({
  NotificationType: { success: 'success', error: 'error' },
  useNotificationCenter: () => ({ addNotification }),
}));

vi.mock('@tanstack/vue-query', () => ({
  useQueryClient: () => ({ invalidateQueries }),
}));

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

import { useCategorizationStatus } from './use-categorization-status';

describe('useCategorizationStatus.hydrateFromServer', () => {
  beforeEach(() => {
    // Module-level shared state persists between tests — start each one clean.
    useCategorizationStatus().reset();
    vi.clearAllMocks();
  });

  it('restores an in-flight processing run', async () => {
    getAiCategorizationStatus.mockResolvedValueOnce({
      status: 'processing',
      processedCount: 500,
      totalCount: 1500,
      failedCount: 2,
    });

    const composable = useCategorizationStatus();
    await composable.hydrateFromServer();

    expect(composable.categorizationStatus.value).toEqual({
      status: 'processing',
      processedCount: 500,
      totalCount: 1500,
      failedCount: 2,
    });
    expect(composable.isCategorizing.value).toBe(true);
  });

  it('restores a queued run', async () => {
    getAiCategorizationStatus.mockResolvedValueOnce({
      status: 'queued',
      processedCount: 0,
      totalCount: 10,
      failedCount: 0,
    });

    const composable = useCategorizationStatus();
    await composable.hydrateFromServer();

    expect(composable.categorizationStatus.value?.status).toBe('queued');
  });

  it.each([
    { status: 'idle' } as const,
    // The server reports `failed` for up to an hour after a run; a fresh tab
    // already loaded post-run data, so it must stay silent instead of toasting
    // the stale failure on every reload.
    { status: 'failed', processedCount: 0, totalCount: 5, failedCount: 5 } as const,
  ])('restores nothing and stays silent on a fresh tab ($status response)', async (payload) => {
    getAiCategorizationStatus.mockResolvedValueOnce(payload);

    const composable = useCategorizationStatus();
    await composable.hydrateFromServer();

    expect(composable.categorizationStatus.value).toBeNull();
    expect(invalidateQueries).not.toHaveBeenCalled();
    expect(addNotification).not.toHaveBeenCalled();
  });

  it('keeps a status a live SSE event delivered while the fetch was in flight', async () => {
    const composable = useCategorizationStatus();
    const liveStatus = {
      status: 'processing' as const,
      processedCount: 1000,
      totalCount: 1500,
      failedCount: 0,
    };

    getAiCategorizationStatus.mockImplementationOnce(async () => {
      // An SSE event lands while the snapshot request is still in flight — the
      // snapshot the server built is now stale and must lose.
      composable.categorizationStatus.value = liveStatus;
      return { status: 'processing', processedCount: 500, totalCount: 1500, failedCount: 0 };
    });
    await composable.hydrateFromServer();

    expect(composable.categorizationStatus.value).toEqual(liveStatus);
  });

  it('refreshes an already-shown run with the newer server counts', async () => {
    const composable = useCategorizationStatus();
    composable.categorizationStatus.value = {
      status: 'processing',
      processedCount: 500,
      totalCount: 1500,
      failedCount: 0,
    };

    getAiCategorizationStatus.mockResolvedValueOnce({
      status: 'processing',
      processedCount: 1000,
      totalCount: 1500,
      failedCount: 3,
    });
    await composable.hydrateFromServer();

    expect(composable.categorizationStatus.value).toEqual({
      status: 'processing',
      processedCount: 1000,
      totalCount: 1500,
      failedCount: 3,
    });
  });

  it('clears a stale run and refetches data when the server reports idle', async () => {
    const composable = useCategorizationStatus();
    composable.categorizationStatus.value = {
      status: 'processing',
      processedCount: 500,
      totalCount: 1500,
      failedCount: 0,
    };

    // The run ended while this tab was disconnected — its terminal SSE event
    // is gone for good, so the snapshot is the only thing that can clear it.
    getAiCategorizationStatus.mockResolvedValueOnce({ status: 'idle' });
    await composable.hydrateFromServer();

    expect(composable.categorizationStatus.value).toBeNull();
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['transactionChange'] });
    expect(addNotification).not.toHaveBeenCalled();
  });

  it('clears a stale run, refetches and shows the failure toast when the server reports failed', async () => {
    const composable = useCategorizationStatus();
    composable.categorizationStatus.value = {
      status: 'processing',
      processedCount: 500,
      totalCount: 1500,
      failedCount: 0,
    };

    // The run failed while this tab was disconnected — the terminal SSE event
    // is gone for good, so the snapshot must deliver the same error toast the
    // live path would have shown.
    getAiCategorizationStatus.mockResolvedValueOnce({
      status: 'failed',
      processedCount: 500,
      totalCount: 1500,
      failedCount: 1000,
    });
    await composable.hydrateFromServer();

    expect(composable.categorizationStatus.value).toBeNull();
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['transactionChange'] });
    expect(addNotification).toHaveBeenCalledWith({ text: 'header.categorization.failed', type: 'error' });
  });

  it('discards a snapshot that resolves after reset() — logout while the fetch is in flight', async () => {
    const composable = useCategorizationStatus();
    getAiCategorizationStatus.mockImplementationOnce(async () => {
      // Logout lands while the snapshot request is still in flight; both sides
      // hold `null`, so only the session epoch can tell the snapshot is stale.
      composable.reset();
      return { status: 'processing', processedCount: 5, totalCount: 10, failedCount: 0 };
    });

    await composable.hydrateFromServer();

    expect(composable.categorizationStatus.value).toBeNull();
  });

  it('logs and swallows fetch errors, leaving the status empty', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    getAiCategorizationStatus.mockRejectedValueOnce(new Error('network down'));

    const composable = useCategorizationStatus();
    await expect(composable.hydrateFromServer()).resolves.toBeUndefined();

    expect(composable.categorizationStatus.value).toBeNull();
    expect(consoleError).toHaveBeenCalledTimes(1);
    consoleError.mockRestore();
  });
});

describe('useCategorizationStatus live SSE completion', () => {
  beforeEach(() => {
    const composable = useCategorizationStatus();
    // Module-level shared state persists between tests — start each one clean, and
    // unsubscribe so every test's subscribeToSSE registers a fresh handler.
    composable.unsubscribeFromSSE();
    composable.reset();
    sse.handlers.length = 0;
    vi.clearAllMocks();
  });

  async function subscribeMidRun() {
    const composable = useCategorizationStatus();
    await composable.subscribeToSSE();
    const deliver = sse.handlers.at(-1)!;
    // The completion branch only fires for a run the tab was already watching
    deliver({ status: 'processing', processedCount: 0, totalCount: 10, failedCount: 0 });
    return { composable, deliver };
  }

  it('toasts the run-level reason when a run completes with nothing categorized', async () => {
    const { deliver } = await subscribeMidRun();

    // A run whose provider died mid-way still ends as `completed` — every transaction
    // failed, and the payload's errorMessage is the only trace of why.
    deliver({
      status: 'completed',
      processedCount: 10,
      totalCount: 10,
      failedCount: 10,
      errorMessage: 'Your custom AI endpoint did not respond.',
    });

    expect(addNotification).toHaveBeenCalledWith({
      text: 'Your custom AI endpoint did not respond.',
      type: 'error',
    });
  });

  it('falls back to the generic failure text when the payload carries no reason', async () => {
    const { deliver } = await subscribeMidRun();

    deliver({ status: 'completed', processedCount: 10, totalCount: 10, failedCount: 10 });

    expect(addNotification).toHaveBeenCalledWith({ text: 'header.categorization.failed', type: 'error' });
  });

  it('keeps the success toast when at least one transaction was categorized', async () => {
    const { deliver } = await subscribeMidRun();

    deliver({ status: 'completed', processedCount: 10, totalCount: 10, failedCount: 4 });

    expect(addNotification).toHaveBeenCalledWith({ text: 'header.categorization.completed', type: 'success' });
    expect(addNotification).toHaveBeenCalledTimes(1);
  });
});
