import { type AvailableModelsResponse, getAvailableModels } from '@/api/ai-settings';
import { AIModelInfoWithRecommendation, AI_FEATURE, AI_PROVIDER } from '@bt/shared/types';
import { useQuery } from '@tanstack/vue-query';
import { type MaybeRefOrGetter, computed, toValue } from 'vue';

import { useAiSettings } from './ai-settings';

export interface ModelGroup {
  provider: AI_PROVIDER | 'recommended';
  models: AIModelInfoWithRecommendation[];
}

/**
 * Composable for fetching and grouping models for a specific AI feature.
 * Each feature can have different recommended models.
 */
export const useFeatureModels = (feature: MaybeRefOrGetter<AI_FEATURE>) => {
  const { configuredProviders } = useAiSettings();

  const modelsQuery = useQuery<AvailableModelsResponse, Error>({
    queryKey: computed(() => ['ai-settings', 'models', toValue(feature)]),
    queryFn: () => getAvailableModels({ feature: toValue(feature) }),
    staleTime: Infinity, // Models rarely change
  });

  const availableModels = computed(() => modelsQuery.data.value?.models ?? []);

  /** Set of providers the user has configured API keys for */
  const userProviders = computed(() => new Set(configuredProviders.value.map((p) => p.provider)));

  /** Check if user has API key for a provider */
  const hasUserKey = (provider: AI_PROVIDER) => userProviders.value.has(provider);

  /**
   * Sort models: available (user has key) first, then unavailable
   */
  const sortByAvailability = (models: AIModelInfoWithRecommendation[]) => {
    return [...models].sort((a, b) => {
      const aHasKey = hasUserKey(a.provider);
      const bHasKey = hasUserKey(b.provider);
      if (aHasKey && !bHasKey) return -1;
      if (!aHasKey && bHasKey) return 1;
      return 0;
    });
  };

  /**
   * Models grouped by provider, with recommended models first.
   * Within each group, models with user API keys are sorted to the top.
   */
  const groupedModels = computed<ModelGroup[]>(() => {
    const recommended: AIModelInfoWithRecommendation[] = [];
    const groups: Record<AI_PROVIDER, AIModelInfoWithRecommendation[]> = {
      [AI_PROVIDER.openai]: [],
      [AI_PROVIDER.anthropic]: [],
      [AI_PROVIDER.google]: [],
      [AI_PROVIDER.groq]: [],
    };

    for (const model of availableModels.value) {
      if (model.recommendedForFeature) {
        recommended.push(model);
      } else {
        groups[model.provider].push(model);
      }
    }

    const result: ModelGroup[] = [];

    // Add recommended group first if it has models (sorted by availability)
    if (recommended.length > 0) {
      result.push({ provider: 'recommended', models: sortByAvailability(recommended) });
    }

    // Add provider groups sorted: providers with user keys first
    const sortedProviders = Object.entries(groups)
      .filter(([, models]) => models.length > 0)
      .sort(([providerA], [providerB]) => {
        const aHasKey = hasUserKey(providerA as AI_PROVIDER);
        const bHasKey = hasUserKey(providerB as AI_PROVIDER);
        if (aHasKey && !bHasKey) return -1;
        if (!aHasKey && bHasKey) return 1;
        return 0;
      });

    for (const [provider, models] of sortedProviders) {
      result.push({ provider: provider as AI_PROVIDER, models });
    }

    return result;
  });

  return {
    availableModels,
    groupedModels,
    isLoading: modelsQuery.isLoading,
    hasUserKey,
  };
};
