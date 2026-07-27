import { AIModelInfo, AI_PROVIDER } from '@bt/shared/types';

import { AI_MODEL_ID } from '../model-ids';

export const GOOGLE_MODELS: Record<Extract<AI_MODEL_ID, `google/${string}`>, AIModelInfo> = {
  // Gemini 3 series. Pro is still preview-only – Google has not shipped a GA Pro
  // in this generation, so the high tier carries the preview suffix.
  [AI_MODEL_ID['google/gemini-3.1-pro-preview']]: {
    id: AI_MODEL_ID['google/gemini-3.1-pro-preview'],
    name: 'Gemini 3.1 Pro (Preview)',
    provider: AI_PROVIDER.google,
    description: 'Strongest Gemini reasoning, no free tier',
    contextWindow: 1_000_000,
    capabilities: ['text-generation', 'structured-output', 'function-calling', 'vision', 'agents'],
    costTier: 'high',
    pricing: { inputPerMillion: 2, outputPerMillion: 12 },
  },
  [AI_MODEL_ID['google/gemini-3.6-flash']]: {
    id: AI_MODEL_ID['google/gemini-3.6-flash'],
    name: 'Gemini 3.6 Flash',
    provider: AI_PROVIDER.google,
    description: 'Latest Flash, strong on documents and multimodal input',
    contextWindow: 1_000_000,
    capabilities: ['text-generation', 'structured-output', 'function-calling', 'vision', 'fast-inference'],
    costTier: 'medium',
    pricing: { inputPerMillion: 1.5, outputPerMillion: 7.5 },
  },
  [AI_MODEL_ID['google/gemini-3.5-flash-lite']]: {
    id: AI_MODEL_ID['google/gemini-3.5-flash-lite'],
    name: 'Gemini 3.5 Flash Lite',
    provider: AI_PROVIDER.google,
    description: 'Fastest and cheapest Gemini, has a free tier',
    contextWindow: 1_000_000,
    capabilities: ['text-generation', 'structured-output', 'function-calling', 'fast-inference'],
    costTier: 'low',
    pricing: { inputPerMillion: 0.3, outputPerMillion: 2.5 },
  },

  // Gemma (open-weight, very generous free-tier limits)
  [AI_MODEL_ID['google/gemma-4-31b-it']]: {
    id: AI_MODEL_ID['google/gemma-4-31b-it'],
    name: 'Gemma 4 31B',
    provider: AI_PROVIDER.google,
    description: 'Open-weight Google model, free on the Gemini API',
    contextWindow: 128_000,
    capabilities: ['text-generation', 'fast-inference'],
    costTier: 'free',
    pricing: { inputPerMillion: 0, outputPerMillion: 0 },
  },
};
