import { AIKeyProvider, AI_FEATURE, AI_PROVIDER } from '@bt/shared/types';
import { logger } from '@js/utils/logger';

import { decryptStoredApiKey, getStoredAiSettings } from '../user-settings/ai-api-key';
import { markCustomEndpointInvalid, readEndpointCredentials } from '../user-settings/ai-custom-endpoint';
import { getFeatureConfig } from '../user-settings/ai-feature-settings';
import { CUSTOM_ENDPOINT_STORED_KEY_UNREADABLE_ERROR_MESSAGE } from './custom-endpoint-failure';
import { getProviderFromModelId } from './models-config';
import { getServerApiKey, pickResolutionStep } from './resolution-ladder';

interface CatalogConfigResolution {
  provider: AIKeyProvider;
  /** `provider/model` format */
  modelId: string;
  apiKey: string;
  usingUserKey: boolean;
}

interface CustomConfigResolution {
  provider: AI_PROVIDER.custom;
  modelId: string;
  /** Null when the endpoint needs no auth */
  apiKey: string | null;
  baseUrl: string;
  customEndpointId: string;
  usingUserKey: true;
}

type AIConfigResolution = CatalogConfigResolution | CustomConfigResolution;

/**
 * Materializes the credentials for the picked resolution step. A credential that fails to
 * materialize (an undecryptable stored key) is excluded and the walk re-runs, so one broken
 * secret never dead-ends a step another credential could serve.
 *
 * Returns null when nothing yields credentials, and also when the user owns endpoints and
 * all of them are down, even with a server key available.
 */
export async function resolveAIConfiguration({
  userId,
  feature,
}: {
  userId: number;
  feature: AI_FEATURE;
}): Promise<AIConfigResolution | null> {
  const config = await getFeatureConfig({ userId, feature });
  const aiSettings = await getStoredAiSettings({ userId });
  const endpoints = aiSettings?.customEndpoints ?? [];
  const storedKeyProviders = (aiSettings?.apiKeys ?? []).map((key) => key.provider);

  if (config && !getProviderFromModelId({ modelId: config.modelId })) {
    logger.warn('Unknown model ID in user feature config', { userId, feature, modelId: config.modelId });
  }

  const excludedEndpointIds = new Set<string>();
  const unreadableKeyProviders = new Set<AIKeyProvider>();

  // Every pass either returns or grows one of the exclusion sets, so the walk ends.
  const maxPasses = endpoints.length + storedKeyProviders.length + 2;

  for (let pass = 0; pass < maxPasses; pass++) {
    const step = pickResolutionStep({
      feature,
      config,
      keyProviders: new Set(storedKeyProviders.filter((provider) => !unreadableKeyProviders.has(provider))),
      endpoints,
      excludedEndpointIds,
    });

    if (pass === 0 && config && step.kind !== 'configured-custom' && step.kind !== 'configured-catalog') {
      // Reachable by deleting the endpoint or key the config relies on: user state, not a bug.
      logger.info('Stored AI feature config cannot answer, falling back', {
        userId,
        feature,
        modelId: config.modelId,
        customEndpointId: config.customEndpointId,
      });
    }

    switch (step.kind) {
      case 'configured-custom':
      case 'fallback-endpoint': {
        const credentials = readEndpointCredentials({ endpoint: step.endpoint, userId });

        if (credentials.hasApiKey && credentials.apiKey === null) {
          // Dialling keyless would surface as an auth failure blaming a key the user never
          // touched, so flag the endpoint with copy that sends them to re-enter the key.
          await markCustomEndpointInvalid({
            userId,
            endpointId: step.endpoint.id,
            errorMessage: CUSTOM_ENDPOINT_STORED_KEY_UNREADABLE_ERROR_MESSAGE,
          });
          excludedEndpointIds.add(step.endpoint.id);
          continue;
        }

        return {
          provider: AI_PROVIDER.custom,
          modelId: step.modelId,
          apiKey: credentials.apiKey,
          baseUrl: credentials.baseUrl,
          customEndpointId: step.endpoint.id,
          usingUserKey: true,
        };
      }

      case 'configured-catalog':
      case 'default-catalog': {
        if (!step.usingUserKey) {
          const serverApiKey = getServerApiKey({ provider: step.provider });
          if (!serverApiKey) {
            logger.error('Server AI key vanished between pick and use', { feature, provider: step.provider });
            return null;
          }
          return { provider: step.provider, modelId: step.modelId, apiKey: serverApiKey, usingUserKey: false };
        }

        const apiKey = decryptStoredApiKey({ aiSettings, provider: step.provider, userId });
        if (apiKey === null) {
          unreadableKeyProviders.add(step.provider);
          continue;
        }
        return { provider: step.provider, modelId: step.modelId, apiKey, usingUserKey: true };
      }

      case 'all-endpoints-down':
        // Serving from the server key would send the user's transactions to a cloud
        // provider they never chose.
        logger.info('Every custom AI endpoint is flagged invalid, leaving the feature unserved', { userId, feature });
        return null;

      case 'unserved':
        if (step.reason === 'invalid-default') {
          logger.error('Invalid default model ID configuration', { feature });
        } else {
          logger.info('No API key available for AI feature', { userId, feature });
        }
        return null;
    }
  }

  logger.error('AI configuration resolution did not settle', { userId, feature });
  return null;
}
