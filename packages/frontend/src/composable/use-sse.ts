import { API_HTTP, API_VER } from '@/api/api-base-url';
import { useAuthStore } from '@/stores/auth';
import {
  type AiCategorizationProgressPayload,
  type SSEEventPayload,
  type SSEEventPayloadMap,
  type SSEEventType,
  SSE_EVENT_TYPES,
} from '@bt/shared/types';
import { EventSourceMessage, fetchEventSource } from '@microsoft/fetch-event-source';
import { ref } from 'vue';

// Re-export types for consumers of this composable
export { SSE_EVENT_TYPES, type AiCategorizationProgressPayload };

type SSEEventHandler<T extends SSEEventPayload = SSEEventPayload> = (data: T) => void;

// Global state for SSE connection
let abortController: AbortController | null = null;
let connectPromise: Promise<void> | null = null;
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

  // If a connect attempt is already in flight, return the same promise so concurrent
  // callers all settle together instead of racing or spawning extra requests.
  if (connectPromise) {
    return connectPromise;
  }

  isConnecting.value = true;
  abortController = new AbortController();

  const url = `${API_HTTP}${API_VER}/sse/events`;

  connectPromise = new Promise<void>((resolve, reject) => {
    let settled = false;

    // Start the connection in the background (don't await - it never resolves while open)
    fetchEventSource(url, {
      method: 'GET',
      credentials: 'include', // Send session cookie for better-auth
      signal: abortController!.signal,
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
  }).finally(() => {
    connectPromise = null;
  });

  return connectPromise;
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
 * Register an event handler. The payload type is inferred from the event name
 * via `SSEEventPayloadMap`, so each handler receives exactly the payload its
 * event carries.
 */
function on<K extends keyof SSEEventPayloadMap>(
  eventType: K,
  cb: (payload: SSEEventPayloadMap[K]) => void,
): () => void {
  if (!eventHandlers.has(eventType)) {
    eventHandlers.set(eventType, new Set());
  }

  eventHandlers.get(eventType)!.add(cb as SSEEventHandler);

  // Return unsubscribe function
  return () => {
    eventHandlers.get(eventType)?.delete(cb as SSEEventHandler);
  };
}

/**
 * Composable for SSE functionality.
 *
 * Note: no per-component unmount cleanup – the connection is global and may be
 * used by other components. Call `disconnect()` explicitly (e.g. on logout).
 */
export function useSSE() {
  return {
    connect,
    disconnect,
    on,
    isConnected,
    isConnecting,
    SSE_EVENT_TYPES,
  };
}
