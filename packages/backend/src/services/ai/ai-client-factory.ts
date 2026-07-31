import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createGroq } from '@ai-sdk/groq';
import { createOpenAI } from '@ai-sdk/openai';
import { AI_FEATURE, AI_PROVIDER, getModelNameFromModelId } from '@bt/shared/types';
import { createGuardedFetch } from '@common/utils/url-guard';
import type { LanguageModel } from 'ai';

import { resolveAIConfiguration } from './ai-model-resolver';

export interface AIClientResult {
  model: LanguageModel;
  provider: AI_PROVIDER;
  /** `provider/model` format */
  modelId: string;
  /** Which custom endpoint serves the model, set only for `AI_PROVIDER.custom` */
  customEndpointId?: string;
  usingUserKey: boolean;
}

/**
 * Create a provider-specific model instance using Vercel AI SDK.
 * `baseUrl` only applies to `AI_PROVIDER.custom`, whose endpoint the user supplies.
 */
function createProviderModel({
  provider,
  modelId,
  apiKey,
  baseUrl,
}: {
  provider: AI_PROVIDER;
  modelId: string;
  apiKey: string | null;
  baseUrl?: string;
}): LanguageModel {
  const modelName = getModelNameFromModelId({ modelId });

  if (provider === AI_PROVIDER.custom) {
    const custom = createOpenAI({
      // Ollama and vLLM accept any bearer token; the placeholder also stops the
      // SDK from falling back to the server's OPENAI_API_KEY env var.
      apiKey: apiKey || 'no-key-required',
      baseURL: baseUrl,
      fetch: createGuardedFetch(),
    });
    // .chat() targets /chat/completions. The default responses-API path is not
    // served by Ollama, vLLM or most OpenAI-compatible proxies.
    return custom.chat(modelName);
  }

  if (!apiKey) {
    throw new Error(`Missing API key for AI provider: ${provider}`);
  }

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
 * `resolveAIConfiguration` owns the resolution order.
 * Returns null when neither an API key nor a custom endpoint is available.
 */
export async function createAIClient({
  userId,
  feature,
}: {
  userId: number;
  feature: AI_FEATURE;
}): Promise<AIClientResult | null> {
  const resolution = await resolveAIConfiguration({ userId, feature });

  if (!resolution) {
    return null;
  }

  const model = createProviderModel({
    provider: resolution.provider,
    modelId: resolution.modelId,
    apiKey: resolution.apiKey,
    baseUrl: resolution.baseUrl,
  });

  return {
    model,
    provider: resolution.provider,
    modelId: resolution.modelId,
    customEndpointId: resolution.customEndpointId,
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
  baseUrl,
}: {
  provider: AI_PROVIDER;
  modelId: string;
  apiKey: string | null;
  baseUrl?: string;
}): LanguageModel {
  return createProviderModel({ provider, modelId, apiKey, baseUrl });
}
