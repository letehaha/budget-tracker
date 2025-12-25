import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createGroq } from '@ai-sdk/groq';
import { createOpenAI } from '@ai-sdk/openai';
import { AI_FEATURE, AI_PROVIDER, getModelNameFromModelId } from '@bt/shared/types';
import type { LanguageModel } from 'ai';

import { resolveAIConfiguration } from './ai-model-resolver';

export interface AIClientResult {
  /** The configured language model instance */
  model: LanguageModel;
  /** The provider being used */
  provider: AI_PROVIDER;
  /** The full model ID (provider/model format) */
  modelId: string;
  /** Whether using the user's own API key */
  usingUserKey: boolean;
}

/**
 * Create a provider-specific model instance using Vercel AI SDK
 */
function createProviderModel({
  provider,
  modelId,
  apiKey,
}: {
  provider: AI_PROVIDER;
  modelId: string;
  apiKey: string;
}): LanguageModel {
  // Extract just the model name from 'provider/model' format
  const modelName = getModelNameFromModelId({ modelId });

  switch (provider) {
    case AI_PROVIDER.openai: {
      const openai = createOpenAI({ apiKey });
      return openai(modelName);
    }
    case AI_PROVIDER.anthropic: {
      const anthropic = createAnthropic({ apiKey });
      return anthropic(modelName);
    }
    case AI_PROVIDER.google: {
      const google = createGoogleGenerativeAI({ apiKey });
      return google(modelName);
    }
    case AI_PROVIDER.groq: {
      const groq = createGroq({ apiKey });
      return groq(modelName);
    }
    default: {
      const _exhaustiveCheck: never = provider;
      throw new Error(`Unsupported AI provider: ${_exhaustiveCheck}`);
    }
  }
}

/**
 * Creates a configured AI model instance for a given feature and user.
 *
 * Resolution order:
 * 1. User's feature-specific config with user's API key
 * 2. User's feature-specific config with server API key
 * 3. Default model with user's API key for that provider
 * 4. Default model with server API key
 *
 * Returns null if no API key is available for any provider.
 */
export async function createAIClient({
  userId,
  feature,
}: {
  userId: number;
  feature: AI_FEATURE;
}): Promise<AIClientResult | null> {
  // Resolve which provider, model, and API key to use
  const resolution = await resolveAIConfiguration({ userId, feature });

  if (!resolution) {
    return null;
  }

  // Create the appropriate provider client
  const model = createProviderModel({
    provider: resolution.provider,
    modelId: resolution.modelId,
    apiKey: resolution.apiKey,
  });

  return {
    model,
    provider: resolution.provider,
    modelId: resolution.modelId,
    usingUserKey: resolution.usingUserKey,
  };
}

/**
 * Create an AI client with explicit configuration (for validation/testing)
 */
export function createAIClientWithConfig({
  provider,
  modelId,
  apiKey,
}: {
  provider: AI_PROVIDER;
  modelId: string;
  apiKey: string;
}): LanguageModel {
  return createProviderModel({ provider, modelId, apiKey });
}
