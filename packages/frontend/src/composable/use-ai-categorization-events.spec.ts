import { afterEach, describe, expect, it, vi } from 'vitest';
import { nextTick, ref } from 'vue';

const subscribeToSSE = vi.fn();
const unsubscribeFromSSE = vi.fn();
const hydrateFromServer = vi.fn();
const reset = vi.fn();
// Shared with the mock below so tests can simulate SSE drops/reconnects.
const isConnected = ref(false);

vi.mock('./use-categorization-status', () => ({
  useCategorizationStatus: () => ({ subscribeToSSE, unsubscribeFromSSE, hydrateFromServer, reset }),
}));

vi.mock('./use-sse', () => ({
  useSSE: () => ({ isConnected }),
}));

import { useAiCategorizationEvents } from './use-ai-categorization-events';

describe('useAiCategorizationEvents.initialize', () => {
  afterEach(async () => {
    // Reset the module-level singleton so each test starts uninitialized.
    useAiCategorizationEvents().cleanup();
    isConnected.value = false;
    await nextTick();
    vi.clearAllMocks();
  });

  it('does not reject when the SSE connection fails before opening', async () => {
    // fetch-event-source auto-reconnects on a pre-open error; the rejection here
    // must not escape as an unhandled promise rejection (Sentry MONEY-MATTER-CLIENT-T).
    subscribeToSSE.mockRejectedValueOnce(new Error('SSE connection error'));

    const { initialize } = useAiCategorizationEvents();

    await expect(initialize()).resolves.toBeUndefined();
    expect(subscribeToSSE).toHaveBeenCalledTimes(1);
  });

  it('allows a later init to retry after a failed connection', async () => {
    subscribeToSSE.mockRejectedValueOnce(new Error('SSE connection error'));
    await useAiCategorizationEvents().initialize();

    subscribeToSSE.mockResolvedValueOnce(undefined);
    await useAiCategorizationEvents().initialize();

    expect(subscribeToSSE).toHaveBeenCalledTimes(2);
  });

  it('rehydrates status from the server after subscribing', async () => {
    subscribeToSSE.mockResolvedValueOnce(undefined);

    await useAiCategorizationEvents().initialize();

    expect(hydrateFromServer).toHaveBeenCalledTimes(1);
  });

  it('still rehydrates when the SSE subscription fails, so a reloaded page shows the run', async () => {
    subscribeToSSE.mockRejectedValueOnce(new Error('SSE connection error'));

    await useAiCategorizationEvents().initialize();

    expect(hydrateFromServer).toHaveBeenCalledTimes(1);
  });

  it('wipes the shared status on cleanup so the next login starts empty', () => {
    useAiCategorizationEvents().cleanup();

    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('re-syncs from the server when the SSE connection is re-established', async () => {
    // Events sent while disconnected are gone for good — a reconnect must
    // refetch the snapshot or a run that ended meanwhile spins forever.
    subscribeToSSE.mockResolvedValueOnce(undefined);
    await useAiCategorizationEvents().initialize();
    hydrateFromServer.mockClear();

    isConnected.value = true;
    await nextTick();

    expect(hydrateFromServer).toHaveBeenCalledTimes(1);
  });

  it('registers the reconnect watcher once across repeated initialize() calls', async () => {
    // A failed first init leaves isInitialized false, so a later login tick
    // calls initialize() again — that retry must not stack a second watcher.
    subscribeToSSE.mockRejectedValueOnce(new Error('SSE connection error'));
    await useAiCategorizationEvents().initialize();

    subscribeToSSE.mockResolvedValueOnce(undefined);
    await useAiCategorizationEvents().initialize();
    hydrateFromServer.mockClear();

    isConnected.value = true;
    await nextTick();

    expect(hydrateFromServer).toHaveBeenCalledTimes(1);
  });

  it('stops re-syncing on reconnects after cleanup', async () => {
    subscribeToSSE.mockResolvedValueOnce(undefined);
    const events = useAiCategorizationEvents();
    await events.initialize();
    events.cleanup();
    hydrateFromServer.mockClear();

    isConnected.value = true;
    await nextTick();

    expect(hydrateFromServer).not.toHaveBeenCalled();
  });
});
