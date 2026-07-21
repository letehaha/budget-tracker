import * as bankDataProvidersApi from '@/api/bank-data-providers';
import type { SyncStatusResponse } from '@/api/bank-data-providers';
import { VUE_QUERY_CACHE_KEYS, VUE_QUERY_GLOBAL_PREFIXES } from '@/common/const';
import type { AccountGroups } from '@/common/types/models';
import { ensureChunkLoaded } from '@/i18n';
import { useAuthStore } from '@/stores/auth';
import type { AccountModel } from '@bt/shared/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { storeToRefs } from 'pinia';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

import { SSE_EVENT_TYPES, useSSE } from './use-sse';

const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;
// If a sync stays active longer than this, surface a "stuck" state to the user
// so the spinner doesn't run indefinitely. Long enough to cover slow Enable
// Banking syncs but well below the backend's 20-min stale threshold.
const DEFAULT_STUCK_SYNC_THRESHOLD_MS = 5 * 60 * 1000;
// Consumers that mount at the same moment already share vue-query's in-flight
// request; this staleTime additionally spares any consumer that mounts within the
// window from its own refetch, while a remount past it still refreshes. SSE keeps
// the cached value live in between.
const SYNC_STATUS_STALE_TIME_MS = 60 * 1000;
const SUCCESS_MESSAGE_TTL_MS = 3000;

function getStuckSyncThresholdMs(): number {
  // Allow Playwright e2e tests to shorten the threshold without waiting 5 min.
  // No-op when the flag isn't set (production / dev), so prod code is unaffected.
  if (typeof window !== 'undefined') {
    const override = (window as unknown as { __TEST_SYNC_STUCK_MS__?: number }).__TEST_SYNC_STUCK_MS__;
    if (typeof override === 'number' && override > 0) return override;
  }
  return DEFAULT_STUCK_SYNC_THRESHOLD_MS;
}

// A status payload counts as "syncing" while any account is actively syncing or
// queued. Shared by the query-derived flag and the SSE completion check.
function isPayloadSyncing(status: SyncStatusResponse | null | undefined): boolean {
  if (!status) return false;
  return status.summary.syncing > 0 || status.summary.queued > 0;
}

// UI-only state shared across all consumers (server data lives in the vue-query
// cache). The watchdog timer and the "just completed" flash are derived from
// sync transitions, so they stay module-scoped.
const justCompleted = ref(false);
const syncStuck = ref(false);
let stuckTimer: ReturnType<typeof setTimeout> | null = null;

// SSE subscription state – one shared subscription regardless of how many
// consumers mount.
let sseUnsubscribe: (() => void) | null = null;
let isSSESubscribed = false;

export function useSyncStatus() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const { connect, disconnect, on, isConnected } = useSSE();
  const { isLoggedIn } = storeToRefs(useAuthStore());

  // Provider names show up in the always-visible header popover regardless of
  // which page the user is on, but live in the integrations route chunk –
  // pull it eagerly so the tooltip resolves before the user hovers.
  void ensureChunkLoaded('pages/account-integrations');

  // Single source of truth for sync status. Every consumer that calls
  // useSyncStatus() subscribes to this one cache entry, so vue-query collapses
  // their concurrent mounts into a single request. SSE and the check/trigger
  // actions write back through the cache.
  const statusQuery = useQuery({
    queryKey: VUE_QUERY_CACHE_KEYS.bankSyncStatus,
    queryFn: bankDataProvidersApi.getSyncStatus,
    enabled: isLoggedIn,
    staleTime: SYNC_STATUS_STALE_TIME_MS,
    // SSE already pushes live updates, so a focus-triggered refetch is redundant.
    refetchOnWindowFocus: false,
  });

  const syncStatusData = computed<SyncStatusResponse | null>(() => statusQuery.data.value ?? null);

  const rawIsSyncing = computed(() => isPayloadSyncing(syncStatusData.value));

  // Once the watchdog flips syncStuck, treat sync as not-in-progress in the UI
  // so the spinner stops. Backend may still be working, but we won't pretend.
  const isSyncing = computed(() => rawIsSyncing.value && !syncStuck.value);

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

  const connectionsNeedingReauth = computed(() => {
    return syncStatusData.value?.connectionsNeedingReauth || [];
  });

  // Built once per reactivity tick so per-account / per-group lookups stay O(1)
  // – three different sidebar/details components query this for every render.
  const reauthConnectionIdsSet = computed(() => new Set(connectionsNeedingReauth.value.map((c) => c.connectionId)));

  function isAccountNeedingReauth(account: Pick<AccountModel, 'bankDataProviderConnectionId'>): boolean {
    const id = account.bankDataProviderConnectionId;
    return id !== null && id !== undefined && reauthConnectionIdsSet.value.has(id);
  }

  function isConnectionNeedingReauth(connectionId: string | null | undefined): boolean {
    return connectionId !== null && connectionId !== undefined && reauthConnectionIdsSet.value.has(connectionId);
  }

  // Walk the group tree (direct accounts + nested child groups) so a mixed-
  // content group still surfaces a warning when any descendant account is on
  // an expired connection – important because groups can hold both bank-linked
  // and manual accounts side by side. Tolerant of undefined arrays so a
  // partial cache payload doesn't crash the sidebar.
  function groupHasReauthAccount(group: AccountGroups): boolean {
    if (reauthConnectionIdsSet.value.size === 0) return false;
    const accounts = group.accounts ?? [];
    if (accounts.some((account) => isAccountNeedingReauth(account))) return true;
    const childGroups = group.childGroups ?? [];
    return childGroups.some((child) => groupHasReauthAccount(child));
  }

  const syncingSummaryText = computed(() => {
    if (!syncStatusData.value || !isSyncing.value) return '';

    const { summary } = syncStatusData.value;
    const inProgress = summary.syncing + summary.queued;

    if (inProgress > 0) {
      return t('header.sync.syncingAccounts', { count: inProgress });
    }
    return '';
  });

  const showSuccessMessage = computed(() => {
    return justCompleted.value && !isSyncing.value && !syncStuck.value;
  });

  // Start/stop the watchdog whenever the underlying syncing flag flips.
  watch(
    rawIsSyncing,
    (active) => {
      if (active) {
        if (stuckTimer) clearTimeout(stuckTimer);
        stuckTimer = setTimeout(() => {
          syncStuck.value = true;
        }, getStuckSyncThresholdMs());
      } else {
        if (stuckTimer) {
          clearTimeout(stuckTimer);
          stuckTimer = null;
        }
        syncStuck.value = false;
      }
    },
    { immediate: true },
  );

  /**
   * Subscribe to SSE sync status events. The handler reads and writes status
   * through the shared query cache via the app-level `queryClient` (stable across
   * component instances). It is registered once at module scope and outlives the
   * component that first opened it, so it must not close over this instance's
   * `syncStatusData` / `rawIsSyncing` computeds – those stop updating once that
   * component unmounts, whereas the cache is always current.
   */
  const subscribeToSSE = () => {
    if (isSSESubscribed) return;

    sseUnsubscribe = on(SSE_EVENT_TYPES.SYNC_STATUS_CHANGED, (data) => {
      const snapshot = data as unknown as SyncStatusResponse;
      // Compare against the cached (not watchdog-masked) state so completion is
      // detected even after the watchdog has already silenced the spinner.
      const previous = queryClient.getQueryData<SyncStatusResponse>(VUE_QUERY_CACHE_KEYS.bankSyncStatus);
      const wasSyncingBefore = isPayloadSyncing(previous);

      // Push the SSE snapshot into the cache so every consumer updates.
      queryClient.setQueryData(VUE_QUERY_CACHE_KEYS.bankSyncStatus, snapshot);

      if (wasSyncingBefore && !isPayloadSyncing(snapshot)) {
        justCompleted.value = true;

        // This is the one hook that observes every completed sync, so it owns
        // invalidating everything a sync touches. payeesList/payeesLookup are named
        // explicitly because a sync fuzzy-creates payees and shifts their
        // transaction-count stats, yet sit outside both prefixes above.
        queryClient.invalidateQueries({ queryKey: [VUE_QUERY_GLOBAL_PREFIXES.transactionChange] });
        queryClient.invalidateQueries({ queryKey: [VUE_QUERY_GLOBAL_PREFIXES.bankConnectionChange] });
        queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.payeesList });
        queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.payeesLookup });

        setTimeout(() => {
          justCompleted.value = false;
        }, SUCCESS_MESSAGE_TTL_MS);

        // Disconnect SSE when sync is complete (per user requirement).
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

  // Attach the shared SSE subscription and open the connection. Idempotent –
  // subscribeToSSE no-ops when already subscribed.
  const ensureSSEConnected = async () => {
    subscribeToSSE();
    await connect();
  };

  const checkSyncMutation = useMutation({
    mutationFn: async () => {
      const result = await bankDataProvidersApi.checkSync();
      // checkSync returns syncTriggered:false both when nothing needs syncing and
      // when a sync is already running (cron / another tab), so refetch to learn
      // the real current state before deciding whether to attach SSE.
      await statusQuery.refetch();
      // Attach SSE when a sync is in progress: just triggered, or already running.
      if (result.syncTriggered || rawIsSyncing.value) {
        await ensureSSEConnected();
      }
      return result;
    },
  });

  const triggerSyncMutation = useMutation({
    mutationFn: async () => {
      // Connect to SSE before triggering so no early progress events are missed.
      await ensureSSEConnected();
      await bankDataProvidersApi.triggerSync();
      // SSE pushes further updates, but refetch immediately for responsiveness.
      await statusQuery.refetch();
    },
  });

  // Loading = an initial/background status fetch or a check/trigger in flight.
  const isLoading = computed(
    () => statusQuery.isFetching.value || checkSyncMutation.isPending.value || triggerSyncMutation.isPending.value,
  );

  /**
   * Force-refresh the current sync status.
   */
  const fetchStatus = async () => {
    await statusQuery.refetch();
  };

  /**
   * Trigger sync and connect to SSE for updates. Returns `false` without acting
   * when confirmation is required (and not skipped) so the caller can prompt.
   */
  const triggerSync = async (skipConfirmation = false): Promise<boolean> => {
    if (!skipConfirmation && needsConfirmation.value) {
      return false;
    }
    try {
      await triggerSyncMutation.mutateAsync();
      return true;
    } catch (err) {
      console.error('Error triggering sync:', err);
      return false;
    }
  };

  /**
   * Start watching an already-running sync: open SSE and load current status
   * WITHOUT triggering a new sync. Used after a flow kicks one off server-side
   * (e.g. connecting a bank) so the header spinner + per-account status reflect
   * it without double-syncing.
   */
  const watchSync = async () => {
    try {
      await ensureSSEConnected();
      await statusQuery.refetch();
    } catch (err) {
      console.error('Error watching sync:', err);
    }
  };

  /**
   * Check whether auto-sync should run and trigger it if needed. Bails when a
   * check is already in flight: unlike queries, concurrent mutation calls don't
   * dedupe, so the guard keeps a second caller from firing a duplicate request.
   */
  const checkAndAutoSync = async () => {
    if (checkSyncMutation.isPending.value) return null;
    try {
      return await checkSyncMutation.mutateAsync();
    } catch (err) {
      console.error('Error checking sync:', err);
      return null;
    }
  };

  // TODO: Multi-tab handling - currently each tab has independent SSE connection.
  // Consider using SharedWorker or BroadcastChannel for coordination.

  return {
    // State
    syncStatusData,
    isLoading,
    isSyncing,
    rawIsSyncing,
    syncStuck,
    syncProgress,
    lastSyncTimestamp,
    timeSinceLastSync,
    needsConfirmation,
    accountStatuses,
    connectionsNeedingReauth,
    isAccountNeedingReauth,
    isConnectionNeedingReauth,
    groupHasReauthAccount,
    syncingSummaryText,
    showSuccessMessage,
    isConnected,

    // Methods
    fetchStatus,
    triggerSync,
    watchSync,
    checkAndAutoSync,
    subscribeToSSE,
    unsubscribeFromSSE,
  };
}
