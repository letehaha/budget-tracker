import { AIFeatureConfig, AIFeatureStatus, AI_FEATURE } from '@bt/shared/types';
import type { StoredAiSettings } from '@models/user-settings.model';
import { resolveFeatureModelDisplay } from '@services/user-settings/resolve-feature-model-display';

export function buildFeatureStatusPayload({
  feature,
  config,
  aiSettings,
}: {
  feature: AI_FEATURE;
  config: AIFeatureConfig | null;
  aiSettings: StoredAiSettings | null;
}): AIFeatureStatus {
  const { modelId, modelName, usingUserKey, customEndpointId, endpointName } = resolveFeatureModelDisplay({
    feature,
    config,
    aiSettings,
  });

  return {
    feature,
    isConfigured: !!config,
    modelId,
    modelName,
    usingUserKey,
    customEndpointId,
    endpointName,
  };
}
