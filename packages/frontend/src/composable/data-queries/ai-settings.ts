import {
  type AiApiKeyStatusResponse,
  type AiFeaturesStatusResponse,
  deleteAiApiKey,
  getAiApiKeyStatus,
  getAiFeaturesStatus,
  resetAiFeatureConfig,
  setAiApiKey,
  setAiFeatureConfig,
  setDefaultAiProvider,
} from '@/api/ai-settings';
import { useOnboardingStore } from '@/stores/onboarding';
import { AI_FEATURE } from '@bt/shared/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed } from 'vue';

const QUERY_KEYS = {
  apiKeyStatus: ['ai-settings', 'api-keys'] as const,
  featuresStatus: ['ai-settings', 'features'] as const,
};

export const useAiSettings = () => {
  const queryClient = useQueryClient();

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

      // Mark onboarding task as complete
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

  // ===== Computed Helpers =====

  const configuredProviders = computed(() => apiKeyStatusQuery.data.value?.providers ?? []);

  const hasAnyApiKey = computed(() => apiKeyStatusQuery.data.value?.hasApiKey ?? false);

  const defaultProvider = computed(() => apiKeyStatusQuery.data.value?.defaultProvider);

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
    defaultProvider,
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

    // Invalidation
    invalidateAll,

    // Raw queries for advanced usage
    apiKeyStatusQuery,
    featuresStatusQuery,
  };
};
