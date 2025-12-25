import { AIModelInfo, AI_PROVIDER } from '@bt/shared/types';

import { AI_MODEL_ID } from '../model-ids';

export const GROQ_MODELS: Record<Extract<AI_MODEL_ID, `groq/${string}`>, AIModelInfo> = {
  [AI_MODEL_ID['groq/llama-3.3-70b-versatile']]: {
    id: AI_MODEL_ID['groq/llama-3.3-70b-versatile'],
    name: 'Llama 3.3 70B',
    provider: AI_PROVIDER.groq,
    description: 'Open-source model with excellent speed on Groq',
    contextWindow: 128_000,
    capabilities: ['text-generation', 'fast-inference'],
    costTier: 'low',
    pricing: { inputPerMillion: 0.59, outputPerMillion: 0.79 },
  },
  [AI_MODEL_ID['groq/llama-3.1-8b-instant']]: {
    id: AI_MODEL_ID['groq/llama-3.1-8b-instant'],
    name: 'Llama 3.1 8B Instant',
    provider: AI_PROVIDER.groq,
    description: 'Ultra-fast for simple categorization tasks',
    contextWindow: 128_000,
    capabilities: ['text-generation', 'fast-inference'],
    costTier: 'free',
    pricing: { inputPerMillion: 0.05, outputPerMillion: 0.08 },
  },
  [AI_MODEL_ID['groq/mixtral-8x7b-32768']]: {
    id: AI_MODEL_ID['groq/mixtral-8x7b-32768'],
    name: 'Mixtral 8x7B',
    provider: AI_PROVIDER.groq,
    description: 'Fast MoE model, great for quick categorization',
    contextWindow: 32_768,
    capabilities: ['text-generation', 'fast-inference'],
    costTier: 'low',
    pricing: { inputPerMillion: 0.24, outputPerMillion: 0.24 },
  },
};
