import { AI_FEATURE, AI_PROVIDER, getProviderFromModelId } from '@bt/shared/types';
import { logger } from '@js/utils/logger';

import { getAiApiKey } from '../user-settings/ai-api-key';
import { getFeatureConfig } from '../user-settings/ai-feature-settings';
import { getDefaultModelForFeature, isValidModelId } from './models-config';

interface AIConfigResolution {
  /** The resolved provider */
  provider: AI_PROVIDER;
  /** The resolved model ID (provider/model format) */
  modelId: string;
  /** The API key to use */
  apiKey: string;
  /** Whether we're using the user's own key (vs server key) */
  usingUserKey: boolean;
}

/**
 * Get server-side API key for a provider from environment variables
 */
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
 * Resolves the AI configuration for a user and feature.
 *
 * Priority:
 * 1. User's explicit feature config with user's API key
 * 2. User's explicit feature config with server API key (if user has no key)
 * 3. Server fallback (default model with server API key)
 *
 * Returns null if no API key is available.
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

    if (!provider) {
      logger.warn('Invalid model ID in user feature config', {
        userId,
        feature,
        modelId: featureConfig.modelId,
      });
      // Fall through to defaults
    } else if (!isValidModelId({ modelId: featureConfig.modelId })) {
      logger.warn('Unknown model ID in user feature config', {
        userId,
        feature,
        modelId: featureConfig.modelId,
      });
      // Fall through to defaults
    } else {
      // Try user's API key first
      const userApiKey = await getAiApiKey({ userId, provider });
      if (userApiKey) {
        return {
          provider,
          modelId: featureConfig.modelId,
          apiKey: userApiKey,
          usingUserKey: true,
        };
      }

      // Try server API key for this provider
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

  // 2. Server fallback with defaults for the feature
  const defaultModelId = getDefaultModelForFeature({ feature });
  const defaultProvider = getProviderFromModelId({ modelId: defaultModelId });

  if (!defaultProvider) {
    logger.error('Invalid default model ID configuration', {
      feature,
      modelId: defaultModelId,
    });
    return null;
  }

  // Try user's key for default provider first
  const userApiKeyForDefault = await getAiApiKey({ userId, provider: defaultProvider });
  if (userApiKeyForDefault) {
    return {
      provider: defaultProvider,
      modelId: defaultModelId,
      apiKey: userApiKeyForDefault,
      usingUserKey: true,
    };
  }

  // Finally, try server API key for default provider
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
