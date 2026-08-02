import {
  createCustomEndpoint as createCustomEndpointRequest,
  deleteCustomEndpoint as deleteCustomEndpointRequest,
  getCustomEndpoints,
  testCustomEndpoint as testCustomEndpointRequest,
  updateCustomEndpoint as updateCustomEndpointRequest,
} from '@/api/ai-settings';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const/vue-query';
import { useOnboardingStore } from '@/stores/onboarding';
import { AICustomEndpointInfo } from '@bt/shared/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed } from 'vue';

/** Query-only: screens that just read the list must not instantiate the mutation observers. */
export const useAiCustomEndpointsList = () => {
  const customEndpointsQuery = useQuery<AICustomEndpointInfo[], Error>({
    queryKey: [...VUE_QUERY_CACHE_KEYS.aiCustomEndpoints],
    queryFn: getCustomEndpoints,
    staleTime: Infinity,
  });

  return {
    customEndpoints: computed(() => customEndpointsQuery.data.value ?? []),
    isLoadingCustomEndpoints: customEndpointsQuery.isLoading,
    // A failed fetch also yields an empty list, so consumers need the error flag
    // to tell "you have none" apart from "we could not load yours".
    isCustomEndpointsError: customEndpointsQuery.isError,
    isFetchingCustomEndpoints: customEndpointsQuery.isFetching,
    refetchCustomEndpoints: customEndpointsQuery.refetch,
  };
};

/**
 * Writes must also invalidate the cached user settings: that cache embeds the AI config,
 * and other settings screens write it back wholesale.
 */
export const useAiCustomEndpoints = () => {
  const queryClient = useQueryClient();
  const endpointsList = useAiCustomEndpointsList();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.aiCustomEndpoints });
    queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.aiFeaturesStatus });
    queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.userSettings });
  };

  const createMutation = useMutation({
    mutationFn: createCustomEndpointRequest,
    onSuccess: () => {
      invalidate();

      const onboardingStore = useOnboardingStore();
      onboardingStore.completeTask('configure-ai');
    },
  });

  const updateMutation = useMutation({
    mutationFn: updateCustomEndpointRequest,
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteCustomEndpointRequest,
    onSuccess: invalidate,
  });

  const testMutation = useMutation({
    mutationFn: testCustomEndpointRequest,
    // A test records its verdict server-side, so the cached rows go stale whatever
    // the outcome, including a thrown request.
    onSettled: invalidate,
  });

  return {
    ...endpointsList,
    invalidateCustomEndpoints: invalidate,

    createCustomEndpoint: createMutation.mutateAsync,
    isCreatingCustomEndpoint: createMutation.isPending,

    updateCustomEndpoint: updateMutation.mutateAsync,
    isUpdatingCustomEndpoint: updateMutation.isPending,

    removeCustomEndpoint: deleteMutation.mutateAsync,
    isRemovingCustomEndpoint: deleteMutation.isPending,

    testCustomEndpointConnection: testMutation.mutateAsync,
    isTestingCustomEndpoint: testMutation.isPending,
  };
};
