import { AIModelInfo, AI_FEATURE, AI_PROVIDER } from '@bt/shared/types';

import { AI_MODEL_ID } from './model-ids';
import { ANTHROPIC_MODELS, GOOGLE_MODELS, GROQ_MODELS, OPENAI_MODELS } from './providers';
import { FEATURE_DEFAULTS, FEATURE_RECOMMENDATIONS } from './recommendations';

export { AI_MODEL_ID } from './model-ids';

/**
 * All available models merged from per-provider configs.
 * TypeScript ensures each provider config covers all its models via Extract type.
 */
export const AVAILABLE_MODELS: Record<AI_MODEL_ID, AIModelInfo> = {
  ...OPENAI_MODELS,
  ...ANTHROPIC_MODELS,
  ...GOOGLE_MODELS,
  ...GROQ_MODELS,
};

/**
 * Get the default model ID for a feature
 */
export function getDefaultModelForFeature({ feature }: { feature: AI_FEATURE }): AI_MODEL_ID {
  return FEATURE_DEFAULTS[feature];
}

/**
 * Get available models as an array, optionally filtered by provider
 */
export function getAvailableModels({ provider }: { provider?: AI_PROVIDER } = {}): AIModelInfo[] {
  const models = Object.values(AVAILABLE_MODELS);
  if (provider) {
    return models.filter((m) => m.provider === provider);
  }
  return models;
}

/**
 * Get model info by model ID
 */
export function getModelInfo({ modelId }: { modelId: string }): AIModelInfo | null {
  return AVAILABLE_MODELS[modelId as AI_MODEL_ID] ?? null;
}

/**
 * Check if a model ID is valid
 */
export function isValidModelId({ modelId }: { modelId: string }): boolean {
  return modelId in AVAILABLE_MODELS;
}

/**
 * Get recommended model IDs for a specific feature
 */
export function getRecommendedModelIds({ feature }: { feature: AI_FEATURE }): AI_MODEL_ID[] {
  return FEATURE_RECOMMENDATIONS[feature] ?? [];
}

/**
 * Check if a model is recommended for a specific feature
 */
export function isModelRecommendedForFeature({ modelId, feature }: { modelId: string; feature: AI_FEATURE }): boolean {
  const recommendations = FEATURE_RECOMMENDATIONS[feature] ?? [];
  return recommendations.includes(modelId as AI_MODEL_ID);
}

/**
 * Extract provider from a model ID (e.g., 'openai/gpt-4o' -> 'openai')
 */
export function getProviderFromModelId({ modelId }: { modelId: string }): AI_PROVIDER | null {
  const model = AVAILABLE_MODELS[modelId as AI_MODEL_ID];
  return model?.provider ?? null;
}

/**
 * Get the first recommended model for a feature that belongs to one of the available providers.
 * Returns null if no recommended model is available for the given providers.
 */
export function getFirstAvailableRecommendedModel({
  feature,
  availableProviders,
}: {
  feature: AI_FEATURE;
  availableProviders: AI_PROVIDER[];
}): AI_MODEL_ID | null {
  const recommendations = FEATURE_RECOMMENDATIONS[feature] ?? [];
  const providerSet = new Set(availableProviders);

  for (const modelId of recommendations) {
    const model = AVAILABLE_MODELS[modelId];
    if (model && providerSet.has(model.provider)) {
      return modelId;
    }
  }

  return null;
}
