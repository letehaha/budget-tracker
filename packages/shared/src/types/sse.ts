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
  SYNC_STATUS_CHANGED: 'bank_connections_sync_status_changed',
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
 * Account sync status for SYNC_STATUS_CHANGED event
 */
export interface SyncAccountStatus {
  accountId: number;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  error: string | null;
  accountName: string;
  providerType: string;
}

/**
 * Payload for SYNC_STATUS_CHANGED event
 */
export interface SyncStatusChangedPayload {
  lastSyncAt: number | null;
  accounts: SyncAccountStatus[];
  summary: {
    total: number;
    syncing: number;
    queued: number;
    completed: number;
    failed: number;
    idle: number;
  };
}

/**
 * Union type for all SSE event payloads
 */
export type SSEEventPayload = AiCategorizationCompletedPayload | SyncStatusChangedPayload;
