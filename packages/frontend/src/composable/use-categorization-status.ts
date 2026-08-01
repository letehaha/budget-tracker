import { getAiCategorizationStatus } from '@/api/ai-categorization';
import { VUE_QUERY_GLOBAL_PREFIXES } from '@/common/const';
import { NotificationType, useNotificationCenter } from '@/components/notification-center';
import type { AiCategorizationStatus } from '@bt/shared/types';
import { useQueryClient } from '@tanstack/vue-query';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

import { type AiCategorizationProgressPayload, SSE_EVENT_TYPES, useSSE } from './use-sse';

// Global state shared across all component instances
const categorizationStatus = ref<AiCategorizationProgressPayload | null>(null);
const justCompleted = ref(false);

// Bumped by reset() so a status snapshot fetched under a previous login can
// never apply after logout — `categorizationStatus` alone can't tell, because
// an idle tab and a reset tab both hold `null`.
let sessionEpoch = 0;

// SSE subscription state
let sseUnsubscribe: (() => void) | null = null;
let isSSESubscribed = false;

/**
 * Composable for tracking AI categorization progress.
 *
 * Subscribes to SSE events for real-time progress updates during
 * AI categorization of imported transactions.
 */
export function useCategorizationStatus() {
  const { connect, on, isConnected } = useSSE();
  const { addNotification } = useNotificationCenter();
  const queryClient = useQueryClient();
  const { t } = useI18n();

  const isCategorizing = computed(() => {
    if (!categorizationStatus.value) return false;
    return categorizationStatus.value.status === 'queued' || categorizationStatus.value.status === 'processing';
  });

  const progress = computed(() => {
    if (!categorizationStatus.value || categorizationStatus.value.totalCount === 0) {
      return 0;
    }
    return Math.round((categorizationStatus.value.processedCount / categorizationStatus.value.totalCount) * 100);
  });

  const showSuccessMessage = computed(() => {
    return justCompleted.value && !isCategorizing.value;
  });

  /**
   * Subscribe to SSE categorization progress events
   */
  const subscribeToSSE = async () => {
    if (isSSESubscribed) return;

    // Connect to SSE first
    await connect();

    sseUnsubscribe = on(SSE_EVENT_TYPES.AI_CATEGORIZATION_PROGRESS, (data) => {
      const wasCategorizingBefore = isCategorizing.value;

      // Update status from SSE event
      categorizationStatus.value = data;

      // Detect completion
      if (wasCategorizingBefore && (data.status === 'completed' || data.status === 'failed')) {
        justCompleted.value = true;

        // Invalidate all transaction-related queries to refetch with new categories
        queryClient.invalidateQueries({
          queryKey: [VUE_QUERY_GLOBAL_PREFIXES.transactionChange],
        });

        // Show notification to user
        const categorizedCount = data.processedCount - data.failedCount;
        if (categorizedCount > 0) {
          addNotification({
            text: t('header.categorization.completed', { count: categorizedCount }),
            type: NotificationType.success,
          });
        } else if (data.status === 'failed' || data.failedCount > 0) {
          // A run whose every transaction failed still ends as `completed`, and the payload's
          // errorMessage carries the reason (e.g. the user's AI endpoint is down) — without
          // this branch such a run would end in silence.
          addNotification({
            text: data.errorMessage ?? t('header.categorization.failed'),
            type: NotificationType.error,
          });
        }

        // Clear success message after 5 seconds
        setTimeout(() => {
          justCompleted.value = false;
          // Clear the status after showing completion
          categorizationStatus.value = null;
        }, 5000);
      }
    });

    isSSESubscribed = true;
  };

  /**
   * Re-sync from the status endpoint. SSE only delivers events that happen
   * while the tab is open and connected, so this covers the two gaps: a page
   * reload during a run (shows nothing) and an SSE drop across the run's end
   * (spinner would stick forever). Called on boot and on every SSE reconnect.
   */
  const hydrateFromServer = async () => {
    const before = categorizationStatus.value;
    const epoch = sessionEpoch;

    let status: AiCategorizationStatus;
    try {
      status = await getAiCategorizationStatus();
    } catch (error) {
      // Best-effort: SSE remains the live channel when the snapshot fetch fails.
      console.error('[AI Categorization] Status snapshot fetch failed:', error);
      return;
    }

    // A reset() while the fetch was in flight means this snapshot belongs to a
    // previous login — drop it.
    if (epoch !== sessionEpoch) return;
    // A live SSE event that landed while the fetch was in flight is fresher
    // than this snapshot — never overwrite it.
    if (categorizationStatus.value !== before) return;

    switch (status.status) {
      case 'queued':
      case 'processing':
        categorizationStatus.value = status;
        return;

      // The server no longer reports the run this tab still shows: it ended
      // while the tab was disconnected, so no terminal SSE event will ever
      // arrive. Clear the indicator, refetch what the run may have changed,
      // and surface a failure the same way the live SSE path does. On a fresh
      // tab these responses restore nothing and stay silent: the page already
      // loaded post-run data, and the server reports `failed` for up to an
      // hour — toasting it on every reload would be noise.
      case 'idle':
      case 'failed': {
        if (before && (before.status === 'queued' || before.status === 'processing')) {
          categorizationStatus.value = null;
          queryClient.invalidateQueries({
            queryKey: [VUE_QUERY_GLOBAL_PREFIXES.transactionChange],
          });
          if (status.status === 'failed') {
            addNotification({
              text: t('header.categorization.failed'),
              type: NotificationType.error,
            });
          }
        }
        return;
      }

      default:
        return status satisfies never;
    }
  };

  /**
   * Unsubscribe from SSE categorization progress events
   */
  const unsubscribeFromSSE = () => {
    if (sseUnsubscribe) {
      sseUnsubscribe();
      sseUnsubscribe = null;
    }
    isSSESubscribed = false;
  };

  /**
   * Reset categorization status
   */
  const reset = () => {
    sessionEpoch += 1;
    categorizationStatus.value = null;
    justCompleted.value = false;
  };

  return {
    // State
    categorizationStatus,
    isCategorizing,
    progress,
    justCompleted,
    showSuccessMessage,
    isConnected,

    // Methods
    subscribeToSSE,
    unsubscribeFromSSE,
    hydrateFromServer,
    reset,
  };
}
