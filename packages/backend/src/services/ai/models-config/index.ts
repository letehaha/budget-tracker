import { AIKeyProvider, AIModelInfo, AI_FEATURE, AI_PROVIDER, isCustomModelId } from '@bt/shared/types';
import { logger } from '@js/utils/logger';

import { AI_MODEL_ID } from './model-ids';
import { ANTHROPIC_MODELS, GOOGLE_MODELS, GROQ_MODELS, OPENAI_MODELS } from './providers';
import { FEATURE_DEFAULTS, FEATURE_RECOMMENDATIONS } from './recommendations';
import { RETIRED_MODELS } from './retired-models';

export { AI_MODEL_ID } from './model-ids';

/**
 * All available models merged from per-provider configs.
 * TypeScript ensures each provider config covers all its models via Extract type.
 */
const AVAILABLE_MODELS: Record<AI_MODEL_ID, AIModelInfo> = {
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
export function getAvailableModels({ provider }: { provider?: AIKeyProvider } = {}): AIModelInfo[] {
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
 * Check if a model ID is valid. `custom/*` IDs name a model on the user's own endpoint,
 * so there is nothing to check against the catalog: the endpoint decides at call time.
 */
export function isValidModelId({ modelId }: { modelId: string }): boolean {
  if (isCustomModelId({ modelId })) return true;
  return modelId in AVAILABLE_MODELS;
}

// True when `modelId` is in `RETIRED_MODELS`. Lets the write path accept stale
// picks (service then upgrades) while still rejecting fully unknown IDs.
export function isRetiredModelId({ modelId }: { modelId: string }): boolean {
  return modelId in RETIRED_MODELS;
}

/**
 * Check if a model is recommended for a specific feature
 */
export function isModelRecommendedForFeature({ modelId, feature }: { modelId: string; feature: AI_FEATURE }): boolean {
  const recommendations = FEATURE_RECOMMENDATIONS[feature] ?? [];
  return recommendations.includes(modelId as AI_MODEL_ID);
}

/**
 * Extract provider from a model ID (e.g., 'openai/gpt-5.6-terra' -> 'openai').
 * `custom/*` IDs are never in the catalog and always belong to the user's own endpoint.
 */
export function getProviderFromModelId({ modelId }: { modelId: string }): AI_PROVIDER | null {
  if (isCustomModelId({ modelId })) return AI_PROVIDER.custom;
  const model = AVAILABLE_MODELS[modelId as AI_MODEL_ID];
  return model?.provider ?? null;
}

// RETIRED_MODELS values are typed AI_MODEL_ID, so a retired ID always maps straight to
// a live one: one lookup, no recursion. `custom/*` IDs are user-authored names with no
// catalog lifecycle, so they pass through.
export function resolveLiveModelId({ modelId, feature }: { modelId: string; feature: AI_FEATURE }): string {
  if (isCustomModelId({ modelId })) return modelId;
  if (modelId in AVAILABLE_MODELS) return modelId as AI_MODEL_ID;

  const replacement = RETIRED_MODELS[modelId];
  if (replacement) return replacement;

  // Callers persist the returned ID, so a dead end silently overwrites the
  // user's pick. Means `RETIRED_MODELS` is missing an entry for this ID.
  const fallbackModelId = FEATURE_DEFAULTS[feature];
  logger.warn('Unresolvable AI model ID, falling back to feature default', {
    modelId,
    feature,
    fallbackModelId,
  });
  return fallbackModelId;
}

/**
 * Get the first recommended model for a feature that belongs to one of the available providers.
 */
export function getFirstAvailableRecommendedModel({
  feature,
  availableProviders,
}: {
  feature: AI_FEATURE;
  availableProviders: AIKeyProvider[];
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
