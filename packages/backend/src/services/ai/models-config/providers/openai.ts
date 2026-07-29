import { AIModelInfo, AI_PROVIDER } from '@bt/shared/types';

import { AI_MODEL_ID } from '../model-ids';

export const OPENAI_MODELS: Record<Extract<AI_MODEL_ID, `openai/${string}`>, AIModelInfo> = {
  [AI_MODEL_ID['openai/gpt-5.6-sol']]: {
    id: AI_MODEL_ID['openai/gpt-5.6-sol'],
    name: 'GPT-5.6 Sol',
    provider: AI_PROVIDER.openai,
    description: 'Frontier OpenAI model, deepest reasoning',
    contextWindow: 1_050_000,
    capabilities: ['text-generation', 'structured-output', 'function-calling', 'vision', 'agents'],
    costTier: 'high',
    pricing: { inputPerMillion: 5, outputPerMillion: 30 },
  },
  [AI_MODEL_ID['openai/gpt-5.6-terra']]: {
    id: AI_MODEL_ID['openai/gpt-5.6-terra'],
    name: 'GPT-5.6 Terra',
    provider: AI_PROVIDER.openai,
    description: 'Balances intelligence and cost for everyday work',
    contextWindow: 1_050_000,
    capabilities: ['text-generation', 'structured-output', 'function-calling', 'vision'],
    costTier: 'medium',
    pricing: { inputPerMillion: 2.5, outputPerMillion: 15 },
  },
  [AI_MODEL_ID['openai/gpt-5.6-luna']]: {
    id: AI_MODEL_ID['openai/gpt-5.6-luna'],
    name: 'GPT-5.6 Luna',
    provider: AI_PROVIDER.openai,
    description: 'Fastest GPT-5.6 tier, built for high-volume workloads',
    contextWindow: 1_050_000,
    capabilities: ['text-generation', 'structured-output', 'function-calling', 'vision', 'fast-inference'],
    costTier: 'low',
    pricing: { inputPerMillion: 1, outputPerMillion: 6 },
  },
  [AI_MODEL_ID['openai/gpt-5.4-nano']]: {
    id: AI_MODEL_ID['openai/gpt-5.4-nano'],
    name: 'GPT-5.4 Nano',
    provider: AI_PROVIDER.openai,
    description: 'Cheapest OpenAI option, good enough for categorization',
    contextWindow: 400_000,
    capabilities: ['text-generation', 'structured-output', 'function-calling', 'vision', 'fast-inference'],
    costTier: 'low',
    pricing: { inputPerMillion: 0.2, outputPerMillion: 1.25 },
  },
};
