import {
  type AiApiKeyStatusResponse,
  type AiFeaturesStatusResponse,
  type CustomInstructionsResponse,
  deleteAiApiKey,
  getAiApiKeyStatus,
  getAiFeaturesStatus,
  getCustomInstructions,
  resetAiFeatureConfig,
  setAiApiKey,
  setAiFeatureConfig,
  setCustomInstructions,
  setDefaultAiProvider,
} from '@/api/ai-settings';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const/vue-query';
import { useOnboardingStore } from '@/stores/onboarding';
import { AI_FEATURE } from '@bt/shared/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed } from 'vue';

import { useAiCustomEndpointsList } from './use-ai-custom-endpoints';

const QUERY_KEYS = {
  apiKeyStatus: VUE_QUERY_CACHE_KEYS.aiApiKeyStatus,
  featuresStatus: VUE_QUERY_CACHE_KEYS.aiFeaturesStatus,
  customInstructions: VUE_QUERY_CACHE_KEYS.aiCustomInstructions,
};

export const useAiSettings = () => {
  const queryClient = useQueryClient();
  const { customEndpoints, isCustomEndpointsError, isFetchingCustomEndpoints, refetchCustomEndpoints } =
    useAiCustomEndpointsList();

  // ===== Queries =====

  const apiKeyStatusQuery = useQuery<AiApiKeyStatusResponse, Error>({
    queryKey: [...QUERY_KEYS.apiKeyStatus],
    queryFn: getAiApiKeyStatus,
    staleTime: Infinity,
  });

  const featuresStatusQuery = useQuery<AiFeaturesStatusResponse, Error>({
    queryKey: [...QUERY_KEYS.featuresStatus],
    queryFn: getAiFeaturesStatus,
    staleTime: 30000, // 30 seconds
  });

  // ===== Mutations =====

  const setApiKeyMutation = useMutation({
    mutationFn: setAiApiKey,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.apiKeyStatus });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.featuresStatus });

      const onboardingStore = useOnboardingStore();
      onboardingStore.completeTask('configure-ai');
    },
  });

  const deleteApiKeyMutation = useMutation({
    mutationFn: deleteAiApiKey,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.apiKeyStatus });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.featuresStatus });
    },
  });

  const setDefaultProviderMutation = useMutation({
    mutationFn: setDefaultAiProvider,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.apiKeyStatus });
    },
  });

  const setFeatureConfigMutation = useMutation({
    mutationFn: setAiFeatureConfig,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.featuresStatus });
    },
  });

  const resetFeatureConfigMutation = useMutation({
    mutationFn: resetAiFeatureConfig,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.featuresStatus });
    },
  });

  // ===== Custom Instructions =====

  const customInstructionsQuery = useQuery<CustomInstructionsResponse, Error>({
    queryKey: [...QUERY_KEYS.customInstructions],
    queryFn: getCustomInstructions,
    staleTime: Infinity,
  });

  const setCustomInstructionsMutation = useMutation({
    mutationFn: setCustomInstructions,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.customInstructions });
    },
  });

  // ===== Computed Helpers =====

  const configuredProviders = computed(() => apiKeyStatusQuery.data.value?.providers ?? []);

  const hasAnyApiKey = computed(() => apiKeyStatusQuery.data.value?.hasApiKey ?? false);

  /** A custom endpoint counts as a credential on its own, since a local model needs no API key. */
  const hasOwnCredentials = computed(() => hasAnyApiKey.value || customEndpoints.value.length > 0);

  /**
   * `false` from `hasOwnCredentials` means nothing here: the endpoint list failed to load.
   * Screens gating on credentials must show a retry, not a "no credentials" state.
   */
  const credentialsUnknown = computed(() => isCustomEndpointsError.value && !hasOwnCredentials.value);

  const defaultProvider = computed(() => apiKeyStatusQuery.data.value?.defaultProvider);

  const customInstructions = computed(() => customInstructionsQuery.data.value?.instructions ?? null);

  const featuresStatus = computed(() => featuresStatusQuery.data.value?.features ?? []);

  /**
   * An empty `featuresStatus` means nothing here: the request failed.
   * Screens reading a feature's config must show a retry, not a "not configured" state.
   */
  const featuresUnknown = computed(
    () => featuresStatusQuery.isError.value && featuresStatusQuery.data.value === undefined,
  );

  const getFeatureStatus = (feature: AI_FEATURE) => {
    return featuresStatus.value.find((f) => f.feature === feature);
  };

  return {
    // Query states
    isLoadingApiKeys: apiKeyStatusQuery.isLoading,
    isLoadingFeatures: featuresStatusQuery.isLoading,
    /** No answer yet — unlike `isLoadingFeatures`, stays true while the query is paused. */
    isFeaturesPending: featuresStatusQuery.isPending,
    isLoading: computed(() => apiKeyStatusQuery.isLoading.value || featuresStatusQuery.isLoading.value),

    // Data
    configuredProviders,
    hasOwnCredentials,
    credentialsUnknown,
    isRefetchingCredentials: isFetchingCustomEndpoints,
    refetchCredentials: refetchCustomEndpoints,
    defaultProvider,
    customInstructions,
    featuresStatus,
    featuresUnknown,
    isRefetchingFeatures: featuresStatusQuery.isFetching,
    refetchFeatures: featuresStatusQuery.refetch,
    getFeatureStatus,

    // API Key mutations
    setApiKey: setApiKeyMutation.mutateAsync,
    isSettingApiKey: setApiKeyMutation.isPending,

    deleteApiKey: deleteApiKeyMutation.mutateAsync,
    isDeletingApiKey: deleteApiKeyMutation.isPending,

    setDefaultProvider: setDefaultProviderMutation.mutateAsync,
    isSettingDefaultProvider: setDefaultProviderMutation.isPending,

    // Feature config mutations
    setFeatureConfig: setFeatureConfigMutation.mutateAsync,
    isSettingFeatureConfig: setFeatureConfigMutation.isPending,

    resetFeatureConfig: resetFeatureConfigMutation.mutateAsync,
    isResettingFeatureConfig: resetFeatureConfigMutation.isPending,

    // Custom instructions mutations
    setCustomInstructions: setCustomInstructionsMutation.mutateAsync,
    isSettingCustomInstructions: setCustomInstructionsMutation.isPending,
  };
};
