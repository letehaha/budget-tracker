import { AIModelInfo, AI_PROVIDER } from '@bt/shared/types';

import { AI_MODEL_ID } from '../model-ids';

export const GOOGLE_MODELS: Record<Extract<AI_MODEL_ID, `google/${string}`>, AIModelInfo> = {
  // Gemini 3 Series (Preview)
  [AI_MODEL_ID['google/gemini-3-pro-preview']]: {
    id: AI_MODEL_ID['google/gemini-3-pro-preview'],
    name: 'Gemini 3 Pro (Preview)',
    provider: AI_PROVIDER.google,
    description: 'Next-gen pro model, powerful reasoning capabilities',
    contextWindow: 1_000_000,
    capabilities: ['text-generation', 'structured-output', 'function-calling', 'vision'],
    costTier: 'high',
    pricing: { inputPerMillion: 2, outputPerMillion: 12 },
  },
  [AI_MODEL_ID['google/gemini-3-flash-preview']]: {
    id: AI_MODEL_ID['google/gemini-3-flash-preview'],
    name: 'Gemini 3 Flash (Preview)',
    provider: AI_PROVIDER.google,
    description: 'Next-gen flash model, ultra-fast inference',
    contextWindow: 1_000_000,
    capabilities: ['text-generation', 'structured-output', 'function-calling', 'fast-inference'],
    costTier: 'low',
    pricing: { inputPerMillion: 0.5, outputPerMillion: 3 },
  },

  // Gemini 2.5 Series
  [AI_MODEL_ID['google/gemini-2.5-pro']]: {
    id: AI_MODEL_ID['google/gemini-2.5-pro'],
    name: 'Gemini 2.5 Pro',
    provider: AI_PROVIDER.google,
    description: 'Most capable 2.5 model with advanced reasoning',
    contextWindow: 1_000_000,
    capabilities: ['text-generation', 'structured-output', 'function-calling', 'vision'],
    costTier: 'high',
    pricing: { inputPerMillion: 1.25, outputPerMillion: 10 },
  },
  [AI_MODEL_ID['google/gemini-2.5-flash']]: {
    id: AI_MODEL_ID['google/gemini-2.5-flash'],
    name: 'Gemini 2.5 Flash',
    provider: AI_PROVIDER.google,
    description: 'Fast and efficient 2.5 model',
    contextWindow: 1_000_000,
    capabilities: ['text-generation', 'structured-output', 'function-calling', 'fast-inference'],
    costTier: 'low',
    pricing: { inputPerMillion: 0.3, outputPerMillion: 2.5 },
  },
  [AI_MODEL_ID['google/gemini-2.5-flash-lite']]: {
    id: AI_MODEL_ID['google/gemini-2.5-flash-lite'],
    name: 'Gemini 2.5 Flash Lite',
    provider: AI_PROVIDER.google,
    description: 'Ultra-lightweight, highest throughput',
    contextWindow: 1_000_000,
    capabilities: ['text-generation', 'fast-inference'],
    costTier: 'free',
    pricing: { inputPerMillion: 0.1, outputPerMillion: 0.4 },
  },
};
