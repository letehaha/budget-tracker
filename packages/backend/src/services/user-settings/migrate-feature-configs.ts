import { AIFeatureConfig, AIKeyProvider, isCustomModelId } from '@bt/shared/types';
import { logger } from '@js/utils/logger';

import { getFirstAvailableRecommendedModel, getProviderFromModelId } from '../ai/models-config';

type MigrationTrigger = 'apiKeyRemoved' | 'customEndpointRemoved';

/**
 * Null when no remaining provider serves a recommended model. The replacement is always a
 * catalog model, so the rebuilt config carries no `customEndpointId`.
 */
function remapToRecommendedModel({
  config,
  remainingProviders,
}: {
  config: AIFeatureConfig;
  remainingProviders: AIKeyProvider[];
}): AIFeatureConfig | null {
  const newModelId = getFirstAvailableRecommendedModel({
    feature: config.feature,
    availableProviders: remainingProviders,
  });

  if (!newModelId) return null;

  return { feature: config.feature, modelId: newModelId };
}

/**
 * An invalidated config with no replacement is dropped, so the feature falls back to the
 * server default. Rewrites are logged because the user never picked the replacement.
 */
function migrateFeatureConfigs({
  featureConfigs,
  isInvalidated,
  remainingProviders,
  trigger,
}: {
  featureConfigs: AIFeatureConfig[];
  isInvalidated: (config: AIFeatureConfig) => boolean;
  remainingProviders: AIKeyProvider[];
  trigger: MigrationTrigger;
}): AIFeatureConfig[] {
  return featureConfigs
    .map((config) => {
      if (!isInvalidated(config)) return config;

      const replacement = remapToRecommendedModel({ config, remainingProviders });

      logger.info('Rewrote an AI feature config invalidated by a settings change', {
        trigger,
        feature: config.feature,
        previousModelId: config.modelId,
        newModelId: replacement?.modelId ?? null,
      });

      return replacement;
    })
    .filter((config): config is AIFeatureConfig => config !== null);
}

/** Invalidates configs on `removedProvider`; other providers may still be served by a server-side key. */
export function migrateFeatureConfigsOnProviderRemoval({
  featureConfigs,
  removedProvider,
  remainingProviders,
}: {
  featureConfigs: AIFeatureConfig[];
  removedProvider: AIKeyProvider;
  remainingProviders: AIKeyProvider[];
}): AIFeatureConfig[] {
  return migrateFeatureConfigs({
    featureConfigs,
    isInvalidated: (config) => getProviderFromModelId({ modelId: config.modelId }) === removedProvider,
    remainingProviders,
    trigger: 'apiKeyRemoved',
  });
}

/** Invalidates only configs bound to `removedEndpointId`. */
export function migrateFeatureConfigsOnCustomEndpointRemoval({
  featureConfigs,
  removedEndpointId,
  remainingProviders,
}: {
  featureConfigs: AIFeatureConfig[];
  removedEndpointId: string;
  remainingProviders: AIKeyProvider[];
}): AIFeatureConfig[] {
  return migrateFeatureConfigs({
    featureConfigs,
    isInvalidated: (config) =>
      isCustomModelId({ modelId: config.modelId }) && config.customEndpointId === removedEndpointId,
    remainingProviders,
    trigger: 'customEndpointRemoved',
  });
}
