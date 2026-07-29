import { AIModelInfo, AI_PROVIDER } from '@bt/shared/types';

import { AI_MODEL_ID } from '../model-ids';

export const GROQ_MODELS: Record<Extract<AI_MODEL_ID, `groq/${string}`>, AIModelInfo> = {
  [AI_MODEL_ID['groq/openai/gpt-oss-120b']]: {
    id: AI_MODEL_ID['groq/openai/gpt-oss-120b'],
    name: 'GPT-OSS 120B',
    provider: AI_PROVIDER.groq,
    description: 'Most capable Groq model, still very cheap',
    contextWindow: 131_072,
    capabilities: ['text-generation', 'structured-output', 'function-calling', 'fast-inference'],
    costTier: 'low',
    pricing: { inputPerMillion: 0.15, outputPerMillion: 0.6 },
  },
  [AI_MODEL_ID['groq/openai/gpt-oss-20b']]: {
    id: AI_MODEL_ID['groq/openai/gpt-oss-20b'],
    name: 'GPT-OSS 20B',
    provider: AI_PROVIDER.groq,
    description: 'Fastest Groq model, great for bulk categorization',
    contextWindow: 131_072,
    capabilities: ['text-generation', 'structured-output', 'function-calling', 'fast-inference'],
    costTier: 'low',
    pricing: { inputPerMillion: 0.075, outputPerMillion: 0.3 },
  },
  [AI_MODEL_ID['groq/llama-3.3-70b-versatile']]: {
    id: AI_MODEL_ID['groq/llama-3.3-70b-versatile'],
    name: 'Llama 3.3 70B',
    provider: AI_PROVIDER.groq,
    description: 'Open-source Llama with excellent speed on Groq',
    contextWindow: 131_072,
    capabilities: ['text-generation', 'function-calling', 'fast-inference'],
    costTier: 'low',
    pricing: { inputPerMillion: 0.59, outputPerMillion: 0.79 },
  },
};
