import { afterEach, describe, expect, it, vi } from 'vitest';

const subscribeToSSE = vi.fn();
const unsubscribeFromSSE = vi.fn();

vi.mock('./use-categorization-status', () => ({
  useCategorizationStatus: () => ({ subscribeToSSE, unsubscribeFromSSE }),
}));

vi.mock('./use-sse', () => ({
  useSSE: () => ({ isConnected: { value: false } }),
}));

import { useAiCategorizationEvents } from './use-ai-categorization-events';

describe('useAiCategorizationEvents.initialize', () => {
  afterEach(() => {
    // Reset the module-level singleton so each test starts uninitialized.
    useAiCategorizationEvents().cleanup();
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
});
