/**
 * Server-Sent Events (SSE) shared types
 *
 * These types are used by both backend and frontend for real-time event communication.
 */
import type { YnabImportProgress } from './ynab-import';

/**
 * SSE Event Types - event names sent via Server-Sent Events
 */
export const SSE_EVENT_TYPES = {
  AI_CATEGORIZATION_PROGRESS: 'ai_categorization_progress',
  SYNC_STATUS_CHANGED: 'bank_connections_sync_status_changed',
  YNAB_IMPORT_PROGRESS: 'ynab_import_progress',
} as const;

export type SSEEventType = (typeof SSE_EVENT_TYPES)[keyof typeof SSE_EVENT_TYPES];

/**
 * Payload for AI_CATEGORIZATION_PROGRESS event
 * Sent during categorization to track progress
 */
export interface AiCategorizationProgressPayload {
  status: 'queued' | 'processing' | 'completed' | 'failed';
  processedCount: number;
  totalCount: number;
  failedCount: number;
}

/**
 * Account sync status for SYNC_STATUS_CHANGED event
 */
export interface SyncAccountStatus {
  accountId: string;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  error: string | null;
  accountName: string;
  providerType: string;
}

/**
 * Bank connection that was auto-deactivated due to upstream auth failure
 * (expired session, revoked consent, invalid refresh token, etc.).
 * The user must reconnect via the integration details page to resume syncing.
 */
export interface ConnectionNeedingReauth {
  connectionId: string;
  providerType: string;
  providerName: string;
  bankName: string | null;
  accountsCount: number;
  deactivatedAt: string | null;
}

/**
 * Payload for SYNC_STATUS_CHANGED event
 */
export interface SyncStatusChangedPayload {
  lastSyncAt: number | null;
  accounts: SyncAccountStatus[];
  connectionsNeedingReauth: ConnectionNeedingReauth[];
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
export type SSEEventPayload = AiCategorizationProgressPayload | SyncStatusChangedPayload | YnabImportProgress;
