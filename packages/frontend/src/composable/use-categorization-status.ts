import { VUE_QUERY_GLOBAL_PREFIXES } from '@/common/const';
import { NotificationType, useNotificationCenter } from '@/components/notification-center';
import { useQueryClient } from '@tanstack/vue-query';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

import { type AiCategorizationProgressPayload, SSE_EVENT_TYPES, useSSE } from './use-sse';

// Global state shared across all component instances
const categorizationStatus = ref<AiCategorizationProgressPayload | null>(null);
const justCompleted = ref(false);

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

    sseUnsubscribe = on<AiCategorizationProgressPayload>(SSE_EVENT_TYPES.AI_CATEGORIZATION_PROGRESS, (data) => {
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
        } else if (data.status === 'failed') {
          addNotification({
            text: t('header.categorization.failed'),
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
    reset,
  };
}
