import { AI_CUSTOM_MODEL_PREFIX, AI_FEATURE, AI_PROVIDER } from '@bt/shared/types';
import { logger } from '@js/utils/logger';

import { getAiApiKey } from '../user-settings/ai-api-key';
import { getCustomEndpointById } from '../user-settings/ai-custom-endpoint';
import { getFeatureConfig } from '../user-settings/ai-feature-settings';
import { resolveFallbackCustomEndpoint } from './custom-endpoint-fallback';
import { getDefaultModelForFeature, getProviderFromModelId } from './models-config';

interface AIConfigResolution {
  provider: AI_PROVIDER;
  /** `provider/model` format */
  modelId: string;
  /** Null only for a custom endpoint that needs no auth */
  apiKey: string | null;
  /** Endpoint root, set only for `AI_PROVIDER.custom` */
  baseUrl?: string;
  /** Which custom endpoint answered, set only for `AI_PROVIDER.custom` */
  customEndpointId?: string;
  usingUserKey: boolean;
}

function getServerApiKey({ provider }: { provider: AI_PROVIDER }): string | null {
  switch (provider) {
    case AI_PROVIDER.google:
      return process.env.GEMINI_API_KEY || null;
    case AI_PROVIDER.openai:
      return process.env.OPENAI_API_KEY || null;
    case AI_PROVIDER.anthropic:
      return process.env.ANTHROPIC_API_KEY || null;
    case AI_PROVIDER.groq:
      return process.env.GROQ_API_KEY || null;
    default:
      return null;
  }
}

/**
 * Resolves the AI configuration for a user and feature. Priority: the user's explicit
 * feature config, then the feature default on the user's own key, then their first
 * custom endpoint not flagged invalid, then the feature default on the server key.
 * Returns null when none of those yield credentials.
 */
export async function resolveAIConfiguration({
  userId,
  feature,
}: {
  userId: number;
  feature: AI_FEATURE;
}): Promise<AIConfigResolution | null> {
  // 1. Check for user's explicit feature configuration
  const featureConfig = await getFeatureConfig({ userId, feature });

  if (featureConfig) {
    const provider = getProviderFromModelId({ modelId: featureConfig.modelId });

    // A null provider means the ID isn't in the model catalog at all.
    if (!provider) {
      logger.warn('Unknown model ID in user feature config', {
        userId,
        feature,
        modelId: featureConfig.modelId,
      });
      // Fall through to defaults
    } else if (provider === AI_PROVIDER.custom) {
      const configuredEndpoint = featureConfig.customEndpointId
        ? await getCustomEndpointById({ userId, endpointId: featureConfig.customEndpointId })
        : null;

      if (configuredEndpoint) {
        return {
          provider: AI_PROVIDER.custom,
          modelId: featureConfig.modelId,
          apiKey: configuredEndpoint.apiKey,
          baseUrl: configuredEndpoint.baseUrl,
          customEndpointId: configuredEndpoint.id,
          usingUserKey: true,
        };
      }

      // Reachable by deleting the endpoint in another tab: user state, not a bug.
      logger.info('Feature config points at a custom model but its endpoint is missing', {
        userId,
        feature,
        modelId: featureConfig.modelId,
        customEndpointId: featureConfig.customEndpointId,
      });
      // Fall through to defaults
    } else {
      const userApiKey = await getAiApiKey({ userId, provider });
      if (userApiKey) {
        return {
          provider,
          modelId: featureConfig.modelId,
          apiKey: userApiKey,
          usingUserKey: true,
        };
      }

      const serverApiKey = getServerApiKey({ provider });
      if (serverApiKey) {
        return {
          provider,
          modelId: featureConfig.modelId,
          apiKey: serverApiKey,
          usingUserKey: false,
        };
      }

      logger.warn('No API key available for user-configured model', {
        userId,
        feature,
        provider,
      });
      // Fall through to try default provider
    }
  }

  // 2. Feature default with the user's own key
  const defaultModelId = getDefaultModelForFeature({ feature });
  const defaultProvider = getProviderFromModelId({ modelId: defaultModelId });

  if (!defaultProvider) {
    logger.error('Invalid default model ID configuration', {
      feature,
      modelId: defaultModelId,
    });
    return null;
  }

  const userApiKeyForDefault = await getAiApiKey({ userId, provider: defaultProvider });
  if (userApiKeyForDefault) {
    return {
      provider: defaultProvider,
      modelId: defaultModelId,
      apiKey: userApiKeyForDefault,
      usingUserKey: true,
    };
  }

  // 3. The user's own endpoint, before falling back to server credentials
  const fallbackEndpointInfo = await resolveFallbackCustomEndpoint({ userId });
  if (fallbackEndpointInfo) {
    const fallbackEndpoint = await getCustomEndpointById({ userId, endpointId: fallbackEndpointInfo.id });

    if (fallbackEndpoint) {
      return {
        provider: AI_PROVIDER.custom,
        modelId: `${AI_CUSTOM_MODEL_PREFIX}${fallbackEndpoint.defaultModel}`,
        apiKey: fallbackEndpoint.apiKey,
        baseUrl: fallbackEndpoint.baseUrl,
        customEndpointId: fallbackEndpoint.id,
        usingUserKey: true,
      };
    }

    // Reachable by deleting the endpoint between the two reads: user state, not a bug.
    logger.info('Fallback custom endpoint went away before its credentials could be read', {
      userId,
      feature,
      customEndpointId: fallbackEndpointInfo.id,
    });
    // Fall through to the server key
  }

  // 4. Server API key for the default provider
  const serverApiKey = getServerApiKey({ provider: defaultProvider });
  if (!serverApiKey) {
    logger.warn('No API key available for AI feature', {
      userId,
      feature,
      provider: defaultProvider,
    });
    return null;
  }

  return {
    provider: defaultProvider,
    modelId: defaultModelId,
    apiKey: serverApiKey,
    usingUserKey: false,
  };
}
