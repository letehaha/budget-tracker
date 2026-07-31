import { AIFeatureConfig, AIFeatureStatus, AI_FEATURE } from '@bt/shared/types';
import { resolveFeatureModelDisplay } from '@services/user-settings/resolve-feature-model-display';

/**
 * `modelId`, `customEndpointId` and `modelName` describe the model that will actually answer,
 * not always the one `config` names. `isConfigured` alone says whether the user picked anything.
 */
export async function buildFeatureStatusPayload({
  userId,
  feature,
  config,
}: {
  userId: number;
  feature: AI_FEATURE;
  config: AIFeatureConfig | null;
}): Promise<AIFeatureStatus> {
  const { modelId, modelName, usingUserKey, customEndpointId, endpointName } = await resolveFeatureModelDisplay({
    userId,
    feature,
    config,
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
