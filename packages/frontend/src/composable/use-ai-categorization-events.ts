import { useCategorizationStatus } from './use-categorization-status';
import { useSSE } from './use-sse';

// Track if already initialized (global singleton)
let isInitialized = false;

/**
 * Initialize AI categorization event handling via SSE.
 *
 * This should be called once at app initialization (e.g., in App.vue)
 * when the user is authenticated. It subscribes to the AI_CATEGORIZATION_PROGRESS
 * event which handles:
 * - Real-time progress updates during categorization
 * - Query invalidation when categorization completes
 * - User notifications on completion/failure
 */
export function useAiCategorizationEvents() {
  const { isConnected } = useSSE();
  const { subscribeToSSE, unsubscribeFromSSE } = useCategorizationStatus();

  const initialize = async () => {
    if (isInitialized) return;

    try {
      // Subscribe to categorization progress events. This also opens the SSE
      // connection, which can fail transiently (e.g. flaky mobile networks)
      // before it is established. The underlying fetch-event-source library
      // auto-reconnects, so such a pre-open failure is non-actionable — swallow
      // it here so this fire-and-forget init can't surface an unhandled
      // rejection. isInitialized stays false so a later login tick can retry.
      await subscribeToSSE();
      isInitialized = true;
    } catch {
      // no-op: reconnect is handled by the SSE library
    }
  };

  const cleanup = () => {
    unsubscribeFromSSE();
    isInitialized = false;
  };

  return {
    initialize,
    cleanup,
    isConnected,
  };
}
