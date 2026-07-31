import {
  AICustomEndpointInfo,
  AIFeatureConfig,
  AI_CUSTOM_MODEL_PREFIX,
  AI_FEATURE,
  AI_PROVIDER,
  getModelNameFromModelId,
  isCustomModelId,
} from '@bt/shared/types';

import { resolveFallbackCustomEndpoint } from '../ai/custom-endpoint-fallback';
import { getDefaultModelForFeature, getModelInfo, getProviderFromModelId } from '../ai/models-config';
import { hasAiApiKey } from './ai-api-key';
import { getCustomEndpointInfoById } from './ai-custom-endpoint';

interface FeatureModelDisplay {
  modelId: string;
  /** Catalog name of `modelId`, or the free-text name for a custom model */
  modelName: string;
  usingUserKey: boolean;
  /** Set together with a `custom/*` `modelId` */
  customEndpointId?: string;
  endpointName?: string;
}

/**
 * Reads the same env vars as `resolveAIConfiguration`, so a server-key run can be
 * told apart from a fallback to the user's own endpoint.
 */
function hasServerApiKey({ provider }: { provider: AI_PROVIDER }): boolean {
  switch (provider) {
    case AI_PROVIDER.google:
      return Boolean(process.env.GEMINI_API_KEY);
    case AI_PROVIDER.openai:
      return Boolean(process.env.OPENAI_API_KEY);
    case AI_PROVIDER.anthropic:
      return Boolean(process.env.ANTHROPIC_API_KEY);
    case AI_PROVIDER.groq:
      return Boolean(process.env.GROQ_API_KEY);
    case AI_PROVIDER.custom:
      return false;
  }
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
  modelName,
}: {
  endpoint: AICustomEndpointInfo;
  modelName: string;
}): FeatureModelDisplay {
  return {
    modelId: `${AI_CUSTOM_MODEL_PREFIX}${modelName}`,
    modelName,
    usingUserKey: true,
    customEndpointId: endpoint.id,
    endpointName: endpoint.name,
  };
}

/**
 * The configured model when it can still answer: a custom model whose endpoint is
 * saved, or a catalog model backed by the user's key or the server's. Null when there
 * are no credentials, so both the call and the screen fall back to the defaults.
 */
async function resolveConfiguredModel({
  userId,
  config,
}: {
  userId: number;
  config: AIFeatureConfig;
}): Promise<FeatureModelDisplay | null> {
  const { modelId, customEndpointId } = config;

  if (isCustomModelId({ modelId })) {
    const endpoint = customEndpointId
      ? await getCustomEndpointInfoById({ userId, endpointId: customEndpointId })
      : null;

    return endpoint ? describeEndpointModel({ endpoint, modelName: getModelNameFromModelId({ modelId }) }) : null;
  }

  // No provider means the ID is in no catalog, so nothing can serve it
  const provider = getProviderFromModelId({ modelId });
  if (!provider) return null;

  if (await hasAiApiKey({ userId, provider })) {
    return describeModel({ modelId, usingUserKey: true });
  }

  if (hasServerApiKey({ provider })) {
    return describeModel({ modelId, usingUserKey: false });
  }

  return null;
}

/**
 * What the AI settings screens show for one feature: which model answers, how it is
 * labelled, and whose credentials pay for it. A feature with no usable key is answered
 * by the user's first dialable endpoint, config or not, and every field then names that
 * endpoint.
 */
export async function resolveFeatureModelDisplay({
  userId,
  feature,
  config,
}: {
  userId: number;
  feature: AI_FEATURE;
  /** The feature's stored config, null when it has none of its own */
  config: AIFeatureConfig | null;
}): Promise<FeatureModelDisplay> {
  if (config) {
    const configuredModel = await resolveConfiguredModel({ userId, config });
    if (configuredModel) return configuredModel;
  }

  const defaultModelId = getDefaultModelForFeature({ feature });
  const configuredModelId = config?.modelId ?? defaultModelId;
  const defaultProvider = getProviderFromModelId({ modelId: defaultModelId });

  if (defaultProvider && (await hasAiApiKey({ userId, provider: defaultProvider }))) {
    return describeModel({ modelId: configuredModelId, usingUserKey: true });
  }

  const fallbackEndpoint = await resolveFallbackCustomEndpoint({ userId });
  if (fallbackEndpoint) {
    return describeEndpointModel({ endpoint: fallbackEndpoint, modelName: fallbackEndpoint.defaultModel });
  }

  // Server key, or no credentials anywhere: the pick is named either way
  return describeModel({ modelId: configuredModelId, usingUserKey: false });
}
