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

import { useAiCustomEndpoints } from './use-ai-custom-endpoints';

const QUERY_KEYS = {
  apiKeyStatus: VUE_QUERY_CACHE_KEYS.aiApiKeyStatus,
  featuresStatus: VUE_QUERY_CACHE_KEYS.aiFeaturesStatus,
  customInstructions: VUE_QUERY_CACHE_KEYS.aiCustomInstructions,
};

export const useAiSettings = () => {
  const queryClient = useQueryClient();
  const { customEndpoints } = useAiCustomEndpoints();

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

  /**
   * The backend gates user-only features, such as custom instructions, on the
   * user owning the credentials. A custom endpoint counts on its own: a local
   * model needs no API key.
   */
  const hasOwnCredentials = computed(() => hasAnyApiKey.value || customEndpoints.value.length > 0);

  const defaultProvider = computed(() => apiKeyStatusQuery.data.value?.defaultProvider);

  const customInstructions = computed(() => customInstructionsQuery.data.value?.instructions ?? null);

  const featuresStatus = computed(() => featuresStatusQuery.data.value?.features ?? []);

  const getFeatureStatus = (feature: AI_FEATURE) => {
    return featuresStatus.value.find((f) => f.feature === feature);
  };

  // ===== Invalidation =====

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['ai-settings'] });
  };

  return {
    // Query states
    isLoadingApiKeys: apiKeyStatusQuery.isLoading,
    isLoadingFeatures: featuresStatusQuery.isLoading,
    isLoading: computed(() => apiKeyStatusQuery.isLoading.value || featuresStatusQuery.isLoading.value),

    // Data
    configuredProviders,
    hasAnyApiKey,
    hasOwnCredentials,
    defaultProvider,
    customInstructions,
    featuresStatus,
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

    // Invalidation
    invalidateAll,

    // Raw queries for advanced usage
    apiKeyStatusQuery,
    featuresStatusQuery,
  };
};
