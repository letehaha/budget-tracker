import { AIModelInfo, AI_PROVIDER } from '@bt/shared/types';

import { AI_MODEL_ID } from '../model-ids';

export const OPENAI_MODELS: Record<Extract<AI_MODEL_ID, `openai/${string}`>, AIModelInfo> = {
  [AI_MODEL_ID['openai/gpt-4o']]: {
    id: AI_MODEL_ID['openai/gpt-4o'],
    name: 'GPT-4o',
    provider: AI_PROVIDER.openai,
    description: 'Most capable OpenAI model, great for complex reasoning',
    contextWindow: 128_000,
    capabilities: ['text-generation', 'structured-output', 'function-calling', 'vision'],
    costTier: 'high',
    pricing: { inputPerMillion: 2.5, outputPerMillion: 10 },
  },
  [AI_MODEL_ID['openai/gpt-4o-mini']]: {
    id: AI_MODEL_ID['openai/gpt-4o-mini'],
    name: 'GPT-4o Mini',
    provider: AI_PROVIDER.openai,
    description: 'Fast and affordable, excellent for categorization tasks',
    contextWindow: 128_000,
    capabilities: ['text-generation', 'structured-output', 'function-calling'],
    costTier: 'low',
    pricing: { inputPerMillion: 0.15, outputPerMillion: 0.6 },
  },
  [AI_MODEL_ID['openai/gpt-4-turbo']]: {
    id: AI_MODEL_ID['openai/gpt-4-turbo'],
    name: 'GPT-4 Turbo',
    provider: AI_PROVIDER.openai,
    description: 'Powerful model with vision capabilities',
    contextWindow: 128_000,
    capabilities: ['text-generation', 'structured-output', 'function-calling', 'vision'],
    costTier: 'high',
    pricing: { inputPerMillion: 10, outputPerMillion: 30 },
  },
};
