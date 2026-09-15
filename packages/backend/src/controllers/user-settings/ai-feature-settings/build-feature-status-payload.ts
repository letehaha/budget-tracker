import { AIFeatureConfig, AIFeatureStatus, AI_FEATURE, FEATURES } from '@bt/shared/types';
import type { StoredAiSettings } from '@models/user-settings.model';
import { hasFeature } from '@services/entitlements/has-feature';
import { resolveFeatureModelDisplay } from '@services/user-settings/resolve-feature-model-display';
import type { Request } from 'express';

/** Reuses the entitlements the request already resolved; only unguarded routes pay for a lookup. */
export const resolveServerKeysAllowed = async ({ req, userId }: { req: Request; userId: number }): Promise<boolean> =>
  req.entitlements?.features.includes(FEATURES.operator_ai) ?? hasFeature({ userId, feature: FEATURES.operator_ai });

export function buildFeatureStatusPayload({
  feature,
  config,
  aiSettings,
  serverKeysAllowed,
}: {
  feature: AI_FEATURE;
  config: AIFeatureConfig | null;
  aiSettings: StoredAiSettings | null;
  serverKeysAllowed: boolean;
}): AIFeatureStatus {
  const { modelId, modelName, usingUserKey, customEndpointId, endpointName } = resolveFeatureModelDisplay({
    feature,
    config,
    aiSettings,
    serverKeysAllowed,
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
