import * as bankDataProvidersApi from '@/api/bank-data-providers';
import type { SyncStatusResponse } from '@/api/bank-data-providers';
import { computed, ref } from 'vue';

import { SSE_EVENT_TYPES, type SyncStatusChangedPayload, useSSE } from './use-sse';

const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;

// Global state shared across all component instances
const syncStatusData = ref<SyncStatusResponse | null>(null);
const isLoading = ref(false);
const error = ref<string | null>(null);
const justCompleted = ref(false); // Track if sync just completed

// SSE subscription state
let sseUnsubscribe: (() => void) | null = null;
let isSSESubscribed = false;

export function useSyncStatus() {
  const { connect, disconnect, on, isConnected } = useSSE();

  const isSyncing = computed(() => {
    if (!syncStatusData.value) return false;
    const { summary } = syncStatusData.value;
    return summary.syncing > 0 || summary.queued > 0;
  });

  const syncProgress = computed(() => {
    if (!syncStatusData.value) return { current: 0, total: 0, percentage: 0 };

    const { summary } = syncStatusData.value;
    const completed = summary.completed + summary.failed;
    const total = summary.total;
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

    return { current: completed, total, percentage };
  });

  const lastSyncTimestamp = computed(() => {
    return syncStatusData.value?.lastSyncAt || null;
  });

  const timeSinceLastSync = computed(() => {
    if (!lastSyncTimestamp.value) return null;
    return Date.now() - lastSyncTimestamp.value;
  });

  const needsConfirmation = computed(() => {
    if (!timeSinceLastSync.value) return false;
    return timeSinceLastSync.value < FOUR_HOURS_MS;
  });

  const accountStatuses = computed(() => {
    return syncStatusData.value?.accounts || [];
  });

  const syncingSummaryText = computed(() => {
    if (!syncStatusData.value || !isSyncing.value) return '';

    const { summary } = syncStatusData.value;
    const inProgress = summary.syncing + summary.queued;

    if (inProgress > 0) {
      return `Syncing ${inProgress} accounts`;
    }
    return '';
  });

  const showSuccessMessage = computed(() => {
    return justCompleted.value && !isSyncing.value;
  });

  /**
   * Subscribe to SSE sync status events
   */
  const subscribeToSSE = () => {
    if (isSSESubscribed) return;

    sseUnsubscribe = on<SyncStatusChangedPayload>(SSE_EVENT_TYPES.SYNC_STATUS_CHANGED, (data) => {
      // Track if sync just completed
      const wasSyncingBefore = isSyncing.value;

      // Update status from SSE event (cast to SyncStatusResponse since the types are compatible)
      syncStatusData.value = data as unknown as SyncStatusResponse;

      // Detect sync completion
      const isNowSyncing = data.summary.syncing > 0 || data.summary.queued > 0;
      if (wasSyncingBefore && !isNowSyncing) {
        justCompleted.value = true;

        // Clear success message after 3 seconds
        setTimeout(() => {
          justCompleted.value = false;
        }, 3000);

        // Disconnect SSE when sync is complete (per user requirement)
        // TODO: Handle SSE reconnection for cron-triggered syncs. Currently SSE
        // disconnects when idle and only reconnects on manual trigger. Cron syncs
        // won't push updates until user manually triggers or refreshes the page.
        // Options: (1) Keep SSE always connected, (2) Use WebSocket, (3) Polling fallback
        disconnect();
      }
    });

    isSSESubscribed = true;
  };

  /**
   * Unsubscribe from SSE sync status events
   */
  const unsubscribeFromSSE = () => {
    if (sseUnsubscribe) {
      sseUnsubscribe();
      sseUnsubscribe = null;
    }
    isSSESubscribed = false;
  };

  /**
   * Fetch current sync status from API
   */
  const fetchStatus = async () => {
    try {
      isLoading.value = true;
      error.value = null;

      const data = await bankDataProvidersApi.getSyncStatus();
      syncStatusData.value = data;
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to fetch sync status';
      console.error('Error fetching sync status:', err);
    } finally {
      isLoading.value = false;
    }
  };

  /**
   * Trigger sync and connect to SSE for updates
   */
  const triggerSync = async (skipConfirmation = false): Promise<boolean> => {
    try {
      // Check if confirmation is needed
      if (!skipConfirmation && needsConfirmation.value) {
        return false; // Caller should show confirmation dialog
      }

      isLoading.value = true;
      error.value = null;

      // Connect to SSE before triggering sync
      subscribeToSSE();
      await connect();

      await bankDataProvidersApi.triggerSync();

      // SSE will receive updates, but also fetch immediately for responsiveness
      await fetchStatus();

      return true;
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to trigger sync';
      console.error('Error triggering sync:', err);
      return false;
    } finally {
      isLoading.value = false;
    }
  };

  /**
   * Check if auto-sync should run and trigger if needed
   */
  const checkAndAutoSync = async () => {
    try {
      isLoading.value = true;
      error.value = null;

      const result = await bankDataProvidersApi.checkSync();

      // Always fetch current status
      await fetchStatus();

      // Connect to SSE if sync was triggered OR if sync is already in progress
      // (e.g., page refresh while sync is running from another tab/session)
      if (result.syncTriggered || isSyncing.value) {
        subscribeToSSE();
        await connect();
      }

      return result;
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to check sync';
      console.error('Error checking sync:', err);
      return null;
    } finally {
      isLoading.value = false;
    }
  };

  // TODO: Multi-tab handling - currently each tab has independent SSE connection.
  // Consider using SharedWorker or BroadcastChannel for coordination.

  return {
    // State
    syncStatusData,
    isLoading,
    error,
    isSyncing,
    syncProgress,
    lastSyncTimestamp,
    timeSinceLastSync,
    needsConfirmation,
    accountStatuses,
    syncingSummaryText,
    showSuccessMessage,
    isConnected,

    // Methods
    fetchStatus,
    triggerSync,
    checkAndAutoSync,
    subscribeToSSE,
    unsubscribeFromSSE,
  };
}
