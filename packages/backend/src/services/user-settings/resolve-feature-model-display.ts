import {
  AIFeatureConfig,
  AI_FEATURE,
  buildCustomModelId,
  getModelNameFromModelId,
  isCustomModelId,
} from '@bt/shared/types';
import type { StoredAiSettings } from '@models/user-settings.model';

import { getDefaultModelForFeature, getModelInfo } from '../ai/models-config';
import { pickResolutionStep, type LadderEndpoint } from '../ai/resolution-ladder';

interface FeatureModelDisplay {
  modelId: string;
  /** Catalog name of `modelId`, or the free-text name for a custom model */
  modelName: string;
  usingUserKey: boolean;
  /** Set together with a `custom/*` `modelId` */
  customEndpointId?: string;
  endpointName?: string;
}

/** A custom model has no catalog entry, so its label is the free-text name itself. */
function describeModel({ modelId, usingUserKey }: { modelId: string; usingUserKey: boolean }): FeatureModelDisplay {
  return {
    modelId,
    modelName: isCustomModelId({ modelId })
      ? getModelNameFromModelId({ modelId })
      : (getModelInfo({ modelId })?.name ?? modelId),
    usingUserKey,
  };
}

function describeEndpointModel({
  endpoint,
  modelId,
}: {
  endpoint: LadderEndpoint;
  modelId: string;
}): FeatureModelDisplay {
  return {
    modelId,
    modelName: getModelNameFromModelId({ modelId }),
    usingUserKey: true,
    customEndpointId: endpoint.id,
    endpointName: endpoint.name,
  };
}

/**
 * Display-only projection of the same `pickResolutionStep` walk the runtime uses, so the
 * screen cannot name a model the run would not pick. Credential failures stay invisible
 * here: an undecryptable stored key surfaces only when the request is made.
 */
export function resolveFeatureModelDisplay({
  feature,
  config,
  aiSettings,
}: {
  feature: AI_FEATURE;
  config: AIFeatureConfig | null;
  aiSettings: StoredAiSettings | null;
}): FeatureModelDisplay {
  const step = pickResolutionStep({
    feature,
    config,
    keyProviders: new Set((aiSettings?.apiKeys ?? []).map((key) => key.provider)),
    endpoints: aiSettings?.customEndpoints ?? [],
  });

  switch (step.kind) {
    case 'configured-custom':
      return describeEndpointModel({ endpoint: step.endpoint, modelId: step.modelId });

    case 'configured-catalog':
    case 'default-catalog':
      return describeModel({ modelId: step.modelId, usingUserKey: step.usingUserKey });

    case 'fallback-endpoint':
      return describeEndpointModel({ endpoint: step.endpoint, modelId: step.modelId });

    // A flagged endpoint still names the feature: the run refuses to move to the server
    // key behind the user's back, so the endpoint is the only thing that could answer.
    case 'all-endpoints-down':
      return describeEndpointModel({
        endpoint: step.endpoint,
        modelId: buildCustomModelId({ modelName: step.endpoint.defaultModel }),
      });

    // No credentials anywhere: nothing runs, so the screen keeps naming the user's own
    // pick (or the feature default) rather than inventing a different model.
    case 'unserved':
      return describeModel({
        modelId: config?.modelId ?? getDefaultModelForFeature({ feature }),
        usingUserKey: false,
      });
  }
}
