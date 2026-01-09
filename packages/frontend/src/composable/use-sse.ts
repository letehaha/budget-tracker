import { useAuthStore } from '@/stores/auth';
import {
  type AiCategorizationCompletedPayload,
  type SSEEventPayload,
  type SSEEventType,
  SSE_EVENT_TYPES,
  type SyncStatusChangedPayload,
} from '@bt/shared/types';
import { EventSourceMessage, fetchEventSource } from '@microsoft/fetch-event-source';
import { onUnmounted, ref } from 'vue';

// Re-export types for consumers of this composable
export { SSE_EVENT_TYPES, type AiCategorizationCompletedPayload, type SyncStatusChangedPayload };

type SSEEventHandler<T extends SSEEventPayload = SSEEventPayload> = (data: T) => void;

const API_HTTP = import.meta.env.DEV
  ? `${window.location.protocol}//${window.location.hostname}:8081`
  : import.meta.env.VITE_APP_API_HTTP;
const API_VER = import.meta.env.VITE_APP_API_VER;

// Global state for SSE connection
let abortController: AbortController | null = null;
const isConnected = ref(false);
const isConnecting = ref(false);

// Event handlers map
const eventHandlers = new Map<SSEEventType, Set<SSEEventHandler>>();

/**
 * Connect to SSE endpoint
 * Returns a promise that resolves when the connection is established
 */
async function connect(): Promise<void> {
  // Don't attempt connection if user is not authenticated
  const authStore = useAuthStore();
  if (!authStore.isLoggedIn) {
    return;
  }

  // If already connected, return immediately
  if (isConnected.value) {
    return;
  }

  // If connection is in progress, wait for it (with timeout)
  if (isConnecting.value) {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        clearInterval(checkConnection);
        resolve(); // Resolve anyway after timeout
      }, 10000); // 10 second timeout

      const checkConnection = setInterval(() => {
        if (isConnected.value || !isConnecting.value) {
          clearInterval(checkConnection);
          clearTimeout(timeout);
          resolve();
        }
      }, 100);
    });
  }

  isConnecting.value = true;
  abortController = new AbortController();

  const url = `${API_HTTP}${API_VER}/sse/events`;

  // Return a promise that resolves when connection opens
  return new Promise((resolve, reject) => {
    let settled = false;

    // Start the connection in the background (don't await - it never resolves while open)
    fetchEventSource(url, {
      method: 'GET',
      credentials: 'include', // Send session cookie for better-auth
      signal: abortController.signal,
      // Keep connection open when tab is hidden. This ensures real-time updates
      // are received even in background tabs. Trade-off: slightly higher battery
      // usage on mobile. Set to false if this becomes an issue.
      openWhenHidden: true,

      onopen: async (response) => {
        if (response.ok) {
          isConnected.value = true;
          isConnecting.value = false;
          if (!settled) {
            settled = true;
            resolve(); // Resolve the promise when connection opens
          }
        } else if (response.status === 401) {
          // Session expired between auth check and request - silently disconnect
          isConnecting.value = false;
          disconnect();
          if (!settled) {
            settled = true;
            resolve();
          }
        } else {
          isConnecting.value = false;
          if (!settled) {
            settled = true;
            reject(new Error(`SSE connection failed: ${response.status}`));
          }
        }
      },

      onmessage: (event: EventSourceMessage) => {
        // SSE comments (lines starting with `:`) like `: connected` and `: keepalive`
        // are parsed by fetch-event-source as empty events with no event name or data.
        // These are used for connection confirmation and keeping the connection alive,
        // not for actual data - skip them.
        if (!event.event || !event.data) {
          return;
        }

        const handlers = eventHandlers.get(event.event as SSEEventType);
        if (handlers && handlers.size > 0) {
          try {
            const data = JSON.parse(event.data) as SSEEventPayload;
            handlers.forEach((handler) => handler(data));
          } catch (e) {
            console.error('[SSE] Failed to parse event data:', e);
          }
        }
      },

      onerror: () => {
        isConnected.value = false;
        isConnecting.value = false;

        // Reject if error happens before connection opened
        if (!settled) {
          settled = true;
          reject(new Error('SSE connection error'));
        }

        // Return retry delay in ms. The library will reconnect after this delay.
        return 3000; // Retry after 3 seconds
      },

      onclose: () => {
        isConnected.value = false;
        isConnecting.value = false;

        // Reject if closed before connection opened
        if (!settled) {
          settled = true;
          reject(new Error('SSE connection closed unexpectedly'));
        }
      },
    }).catch((err) => {
      // AbortError is expected when disconnecting
      if (err instanceof Error && err.name !== 'AbortError') {
        console.error('[SSE] Failed to connect:', err);
      }
      isConnected.value = false;
      isConnecting.value = false;
    });
  });
}

/**
 * Disconnect from SSE
 */
function disconnect(): void {
  if (abortController) {
    abortController.abort();
    abortController = null;
  }
  isConnected.value = false;
  isConnecting.value = false;
}

/**
 * Register an event handler
 */
function on<T extends SSEEventPayload>(eventType: SSEEventType, handler: SSEEventHandler<T>): () => void {
  if (!eventHandlers.has(eventType)) {
    eventHandlers.set(eventType, new Set());
  }

  eventHandlers.get(eventType)!.add(handler as SSEEventHandler);

  // Return unsubscribe function
  return () => {
    eventHandlers.get(eventType)?.delete(handler as SSEEventHandler);
  };
}

/**
 * Composable for SSE functionality
 */
export function useSSE() {
  // Auto-cleanup on component unmount
  onUnmounted(() => {
    // Note: We don't disconnect here because the connection is global
    // and may be used by other components
  });

  return {
    connect,
    disconnect,
    on,
    isConnected,
    isConnecting,
    SSE_EVENT_TYPES,
  };
}
