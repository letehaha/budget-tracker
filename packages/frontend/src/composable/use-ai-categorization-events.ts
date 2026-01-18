import { onMounted, ref } from 'vue';

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
  const initialized = ref(false);

  const initialize = async () => {
    if (isInitialized) {
      initialized.value = true;
      return;
    }

    // Subscribe to categorization progress events
    // This also connects to SSE if not already connected
    await subscribeToSSE();

    isInitialized = true;
    initialized.value = true;
  };

  const cleanup = () => {
    unsubscribeFromSSE();
    isInitialized = false;
    initialized.value = false;
  };

  // Don't cleanup on unmount as this is a singleton
  // Only cleanup when explicitly called (e.g., on logout)
  onMounted(() => {
    initialize();
  });

  return {
    initialize,
    cleanup,
    isConnected,
    isInitialized: initialized,
  };
}
