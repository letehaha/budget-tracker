import { watch } from 'vue';

import { useCategorizationStatus } from './use-categorization-status';
import { useSSE } from './use-sse';

// Track if already initialized (global singleton)
let isInitialized = false;
let stopReconnectWatch: (() => void) | null = null;

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
  const { subscribeToSSE, unsubscribeFromSSE, hydrateFromServer, reset } = useCategorizationStatus();

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

    // Snapshot runs even when the subscribe attempt failed pre-open: the SSE
    // library keeps retrying in the background, and a reloaded page should
    // show an in-flight run either way. Errors are swallowed inside.
    await hydrateFromServer();

    // Events sent while disconnected are gone for good, so every re-established
    // connection re-syncs from the snapshot endpoint. Registered after the
    // initial connect: it only fires on real reconnects.
    if (!stopReconnectWatch) {
      stopReconnectWatch = watch(isConnected, (connected) => {
        if (connected) hydrateFromServer();
      });
    }
  };

  const cleanup = () => {
    unsubscribeFromSSE();
    stopReconnectWatch?.();
    stopReconnectWatch = null;
    // Wipe the shared status so the next login in this tab (possibly a
    // different user) starts empty instead of showing the previous user's run.
    reset();
    isInitialized = false;
  };

  return {
    initialize,
    cleanup,
    isConnected,
  };
}
