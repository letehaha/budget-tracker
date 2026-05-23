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

    // Subscribe to categorization progress events
    // This also connects to SSE if not already connected
    await subscribeToSSE();

    isInitialized = true;
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
