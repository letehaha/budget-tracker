import { AIModelInfo, AI_PROVIDER } from '@bt/shared/types';

import { AI_MODEL_ID } from '../model-ids';

export const OPENROUTER_MODELS: Record<Extract<AI_MODEL_ID, `openrouter/${string}`>, AIModelInfo> = {
  [AI_MODEL_ID['openrouter/openai/gpt-oss-20b']]: {
    id: AI_MODEL_ID['openrouter/openai/gpt-oss-20b'],
    name: 'GPT-OSS 20B',
    provider: AI_PROVIDER.openrouter,
    description: 'Low-cost open model routed through OpenRouter',
    contextWindow: 131_072,
    capabilities: ['text-generation', 'structured-output', 'function-calling', 'fast-inference'],
    costTier: 'low',
    pricing: { inputPerMillion: 0.03, outputPerMillion: 0.13 },
  },
  [AI_MODEL_ID['openrouter/openai/gpt-5.4-nano']]: {
    id: AI_MODEL_ID['openrouter/openai/gpt-5.4-nano'],
    name: 'GPT-5.4 Nano',
    provider: AI_PROVIDER.openrouter,
    description: 'Efficient OpenAI model routed through OpenRouter',
    contextWindow: 400_000,
    capabilities: ['text-generation', 'structured-output', 'function-calling', 'vision'],
    costTier: 'low',
    pricing: { inputPerMillion: 0.2, outputPerMillion: 1.25 },
  },
  [AI_MODEL_ID['openrouter/google/gemini-3.5-flash-lite']]: {
    id: AI_MODEL_ID['openrouter/google/gemini-3.5-flash-lite'],
    name: 'Gemini 3.5 Flash Lite',
    provider: AI_PROVIDER.openrouter,
    description: 'Long-context Gemini model routed through OpenRouter',
    contextWindow: 1_048_576,
    capabilities: ['text-generation', 'structured-output', 'function-calling', 'vision', 'fast-inference'],
    costTier: 'low',
    pricing: { inputPerMillion: 0.3, outputPerMillion: 2.5 },
  },
  [AI_MODEL_ID['openrouter/anthropic/claude-haiku-4.5']]: {
    id: AI_MODEL_ID['openrouter/anthropic/claude-haiku-4.5'],
    name: 'Claude Haiku 4.5',
    provider: AI_PROVIDER.openrouter,
    description: 'Fast Claude model routed through OpenRouter',
    contextWindow: 200_000,
    capabilities: ['text-generation', 'structured-output', 'function-calling', 'vision', 'fast-inference'],
    costTier: 'medium',
    pricing: { inputPerMillion: 1, outputPerMillion: 5 },
  },
};
