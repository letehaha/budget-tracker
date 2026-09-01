import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createGroq } from '@ai-sdk/groq';
import { createOpenAI } from '@ai-sdk/openai';
import { AIKeyProvider, AI_FEATURE, AI_PROVIDER, getModelNameFromModelId } from '@bt/shared/types';
import { createGuardedFetch } from '@common/utils/url-guard';
import type { LanguageModel } from 'ai';

import { resolveAIConfiguration } from './ai-model-resolver';

interface AIClientBase {
  model: LanguageModel;
  /** `provider/model` format */
  modelId: string;
  usingUserKey: boolean;
}

export type AIClientResult =
  | (AIClientBase & { provider: AIKeyProvider })
  | (AIClientBase & { provider: AI_PROVIDER.custom; customEndpointId: string; usingUserKey: true });

/** `baseUrl` is required on the custom arm so a user-endpoint client can never dial the provider's public API. */
type ProviderModelSpec =
  | { provider: AIKeyProvider; modelId: string; apiKey: string }
  | { provider: AI_PROVIDER.custom; modelId: string; apiKey: string | null; baseUrl: string };

function createProviderModel(spec: ProviderModelSpec): LanguageModel {
  const modelName = getModelNameFromModelId({ modelId: spec.modelId });

  if (spec.provider === AI_PROVIDER.custom) {
    const custom = createOpenAI({
      // Ollama and vLLM accept any bearer token, and the placeholder stops the SDK from
      // falling back to the server's OPENAI_API_KEY env var.
      apiKey: spec.apiKey || 'no-key-required',
      baseURL: spec.baseUrl,
      fetch: createGuardedFetch(),
    });
    // .chat() targets /chat/completions. The default responses-API path is not
    // served by Ollama, vLLM or most OpenAI-compatible proxies.
    return custom.chat(modelName);
  }

  const { provider, apiKey } = spec;

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
    case AI_PROVIDER.openrouter: {
      const openrouter = createOpenAI({
        apiKey,
        baseURL: 'https://openrouter.ai/api/v1',
      });
      return openrouter.chat(modelName);
    }
    default: {
      const _exhaustiveCheck: never = provider;
      throw new Error(`Unsupported AI provider: ${_exhaustiveCheck}`);
    }
  }
}

/**
 * Creates a configured AI model instance for a given feature and user.
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

  if (resolution.provider === AI_PROVIDER.custom) {
    return {
      model: createProviderModel(resolution),
      provider: resolution.provider,
      modelId: resolution.modelId,
      customEndpointId: resolution.customEndpointId,
      usingUserKey: resolution.usingUserKey,
    };
  }

  return {
    model: createProviderModel(resolution),
    provider: resolution.provider,
    modelId: resolution.modelId,
    usingUserKey: resolution.usingUserKey,
  };
}

/**
 * Create an AI client with explicit configuration (for validation/testing)
 */
export function createAIClientWithConfig(spec: ProviderModelSpec): LanguageModel {
  return createProviderModel(spec);
}
