import { VUE_QUERY_GLOBAL_PREFIXES } from '@/common/const';
import { NotificationType, useNotificationCenter } from '@/components/notification-center';
import { useQueryClient } from '@tanstack/vue-query';
import { onMounted, onUnmounted, ref } from 'vue';

import { AiCategorizationCompletedPayload, SSE_EVENT_TYPES, useSSE } from './use-sse';

// Track if already initialized (global singleton)
let isInitialized = false;
let unsubscribe: (() => void) | null = null;

/**
 * Initialize AI categorization event handling via SSE.
 *
 * This should be called once at app initialization (e.g., in App.vue)
 * when the user is authenticated.
 */
export function useAiCategorizationEvents() {
  const { connect, on, isConnected } = useSSE();
  const { addNotification } = useNotificationCenter();
  const queryClient = useQueryClient();
  const initialized = ref(false);

  const initialize = async () => {
    if (isInitialized) {
      initialized.value = true;
      return;
    }

    // Connect to SSE
    await connect();

    // Subscribe to AI categorization completed events
    unsubscribe = on<AiCategorizationCompletedPayload>(SSE_EVENT_TYPES.AI_CATEGORIZATION_COMPLETED, (data) => {
      console.log('[AI Categorization] Received completion event:', data);

      // Invalidate all transaction-related queries to refetch with new categories
      queryClient.invalidateQueries({
        queryKey: [VUE_QUERY_GLOBAL_PREFIXES.transactionChange],
      });

      // Show notification to user
      if (data.categorizedCount > 0) {
        addNotification({
          text: `AI categorized ${data.categorizedCount} transaction${data.categorizedCount > 1 ? 's' : ''}`,
          type: NotificationType.success,
        });
      }
    });

    isInitialized = true;
    initialized.value = true;
  };

  const cleanup = () => {
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
    isInitialized = false;
    initialized.value = false;
  };

  onMounted(() => {
    initialize();
  });

  onUnmounted(() => {
    // Don't cleanup on unmount as this is a singleton
    // Only cleanup when explicitly called (e.g., on logout)
  });

  return {
    initialize,
    cleanup,
    isConnected,
    isInitialized: initialized,
  };
}
