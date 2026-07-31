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

/**
 * The user's own OpenAI-compatible endpoints. Writes also invalidate the feature
 * statuses, because the backend remaps configs pointing at a removed endpoint.
 */
export const useAiCustomEndpoints = () => {
  const queryClient = useQueryClient();

  const customEndpointsQuery = useQuery<AICustomEndpointInfo[], Error>({
    queryKey: [...VUE_QUERY_CACHE_KEYS.aiCustomEndpoints],
    queryFn: getCustomEndpoints,
    staleTime: Infinity,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.aiCustomEndpoints });
    queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.aiFeaturesStatus });
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
  });

  const customEndpoints = computed(() => customEndpointsQuery.data.value ?? []);

  return {
    customEndpoints,
    isLoadingCustomEndpoints: customEndpointsQuery.isLoading,
    // A failed fetch also yields an empty list, so consumers need the error flag
    // to tell "you have none" apart from "we could not load yours".
    isCustomEndpointsError: customEndpointsQuery.isError,
    isFetchingCustomEndpoints: customEndpointsQuery.isFetching,
    refetchCustomEndpoints: customEndpointsQuery.refetch,
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
