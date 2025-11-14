import * as bankDataProvidersApi from '@/api/bank-data-providers';
import type { SyncStatusResponse } from '@/api/bank-data-providers';
import { computed, onUnmounted, ref } from 'vue';

const POLL_INTERVAL = 5000; // 5 seconds
const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;

// Global state shared across all component instances
const syncStatusData = ref<SyncStatusResponse | null>(null);
const isLoading = ref(false);
const error = ref<string | null>(null);
const pollIntervalId = ref<NodeJS.Timeout | null>(null);
const wasSyncing = ref(false); // Track if sync was in progress
const justCompleted = ref(false); // Track if sync just completed

export function useSyncStatus() {
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
    if (summary.syncing > 0) {
      return `Syncing ${summary.syncing} of ${summary.total} accounts`;
    }
    if (summary.queued > 0) {
      return `${summary.queued} account${summary.queued > 1 ? 's' : ''} queued`;
    }
    return '';
  });

  const showSuccessMessage = computed(() => {
    return justCompleted.value && !isSyncing.value;
  });

  const fetchStatus = async () => {
    try {
      isLoading.value = true;
      error.value = null;

      // Store previous syncing state
      const wasSyncingBefore = isSyncing.value;

      const data = await bankDataProvidersApi.getSyncStatus();
      syncStatusData.value = data;

      // Detect sync completion
      if (wasSyncingBefore && !isSyncing.value) {
        justCompleted.value = true;

        // Clear success message after 3 seconds
        setTimeout(() => {
          justCompleted.value = false;
        }, 3000);
      }

      // Update tracking state
      wasSyncing.value = isSyncing.value;
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to fetch sync status';
      console.error('Error fetching sync status:', err);
    } finally {
      isLoading.value = false;
    }
  };

  const startPolling = () => {
    stopPolling(); // Clear any existing interval
    pollIntervalId.value = setInterval(async () => {
      await fetchStatus();

      // Stop polling if nothing is syncing
      if (!isSyncing.value) {
        stopPolling();
      }
    }, POLL_INTERVAL);
  };

  const stopPolling = () => {
    if (pollIntervalId.value) {
      clearInterval(pollIntervalId.value);
      pollIntervalId.value = null;
    }
  };

  const triggerSync = async (skipConfirmation = false): Promise<boolean> => {
    try {
      // Check if confirmation is needed
      if (!skipConfirmation && needsConfirmation.value) {
        return false; // Caller should show confirmation dialog
      }

      isLoading.value = true;
      error.value = null;

      await bankDataProvidersApi.triggerSync();

      // Immediately fetch updated status
      await fetchStatus();

      // Always start polling after trigger (providers set SYNCING asynchronously)
      startPolling();

      return true;
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to trigger sync';
      console.error('Error triggering sync:', err);
      return false;
    } finally {
      isLoading.value = false;
    }
  };

  const checkAndAutoSync = async () => {
    try {
      isLoading.value = true;
      error.value = null;

      const result = await bankDataProvidersApi.checkSync();

      // Update status
      await fetchStatus();

      // Start polling if sync was triggered (providers set SYNCING asynchronously)
      if (result.syncTriggered) {
        startPolling();
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

  // Cleanup on component unmount
  onUnmounted(() => {
    stopPolling();
  });

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

    // Methods
    fetchStatus,
    triggerSync,
    checkAndAutoSync,
    startPolling,
    stopPolling,
  };
}
