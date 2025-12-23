/**
 * Server-Sent Events (SSE) shared types
 *
 * These types are used by both backend and frontend for real-time event communication.
 */

/**
 * SSE Event Types - event names sent via Server-Sent Events
 */
export const SSE_EVENT_TYPES = {
  AI_CATEGORIZATION_COMPLETED: 'ai_categorization_completed',
  // Future events:
  // SYNC_STATUS_CHANGED: 'sync_status_changed',
} as const;

export type SSEEventType = (typeof SSE_EVENT_TYPES)[keyof typeof SSE_EVENT_TYPES];

/**
 * Payload for AI_CATEGORIZATION_COMPLETED event
 */
export interface AiCategorizationCompletedPayload {
  categorizedCount: number;
  failedCount: number;
}

/**
 * Union type for all SSE event payloads
 */
export type SSEEventPayload = AiCategorizationCompletedPayload;
// Future: | SyncStatusChangedPayload;
