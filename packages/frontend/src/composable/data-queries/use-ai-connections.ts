import {
  createAiConnection,
  deleteAiConnection,
  getAiConnections,
  setDefaultAiConnection,
  testAiConnection,
  updateAiConnection,
} from '@/api/ai-settings';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const/vue-query';
import { trackAnalyticsEvent } from '@/lib/posthog';
import { useOnboardingStore } from '@/stores/onboarding';
import { AIConnectionInfo } from '@bt/shared/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed } from 'vue';

/** Query-only: screens that just read the list must not instantiate the mutation observers. */
export const useAiConnectionsList = () => {
  const connectionsQuery = useQuery<AIConnectionInfo[], Error>({
    queryKey: [...VUE_QUERY_CACHE_KEYS.aiConnections],
    queryFn: getAiConnections,
    staleTime: Infinity,
  });

  return {
    connections: computed(() => connectionsQuery.data.value ?? []),
    isLoadingConnections: connectionsQuery.isLoading,
    // A failed fetch also yields an empty list, so consumers need the error flag
    // to tell "you have none" apart from "we could not load yours".
    isConnectionsError: connectionsQuery.isError,
    isFetchingConnections: connectionsQuery.isFetching,
    refetchConnections: connectionsQuery.refetch,
  };
};

/** Every write also invalidates the features status, since automatic features follow the list order. */
export const useAiConnections = () => {
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.aiConnections });
    queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.aiFeaturesStatus });
  };

  const createMutation = useMutation({
    mutationFn: createAiConnection,
    onSuccess: (_connection, { provider }) => {
      invalidate();
      useOnboardingStore().completeTask('configure-ai');
      trackAnalyticsEvent({ event: 'ai_connection_created', properties: { provider } });
    },
  });

  const updateMutation = useMutation({
    mutationFn: updateAiConnection,
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteAiConnection,
    onSettled: invalidate,
  });

  const setDefaultMutation = useMutation({
    mutationFn: setDefaultAiConnection,
    onSuccess: invalidate,
  });

  const testMutation = useMutation({ mutationFn: testAiConnection });

  return {
    invalidateConnections: invalidate,

    createConnection: createMutation.mutateAsync,
    isCreatingConnection: createMutation.isPending,

    updateConnection: updateMutation.mutateAsync,
    isUpdatingConnection: updateMutation.isPending,

    removeConnection: deleteMutation.mutateAsync,
    isRemovingConnection: deleteMutation.isPending,

    setDefaultConnection: setDefaultMutation.mutateAsync,
    isSettingDefaultConnection: setDefaultMutation.isPending,

    testConnection: testMutation.mutateAsync,
    isTestingConnection: testMutation.isPending,
  };
};
