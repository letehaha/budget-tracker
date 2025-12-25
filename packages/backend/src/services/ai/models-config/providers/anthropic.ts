import { AIModelInfo, AI_PROVIDER } from '@bt/shared/types';

import { AI_MODEL_ID } from '../model-ids';

export const ANTHROPIC_MODELS: Record<Extract<AI_MODEL_ID, `anthropic/${string}`>, AIModelInfo> = {
  [AI_MODEL_ID['anthropic/claude-opus-4-5']]: {
    id: AI_MODEL_ID['anthropic/claude-opus-4-5'],
    name: 'Claude Opus 4.5',
    provider: AI_PROVIDER.anthropic,
    description: 'Most capable model for complex tasks',
    contextWindow: 200_000,
    capabilities: ['text-generation', 'function-calling', 'vision', 'agents'],
    costTier: 'high',
    pricing: { inputPerMillion: 15, outputPerMillion: 75 },
  },
  [AI_MODEL_ID['anthropic/claude-sonnet-4-5']]: {
    id: AI_MODEL_ID['anthropic/claude-sonnet-4-5'],
    name: 'Claude Sonnet 4.5',
    provider: AI_PROVIDER.anthropic,
    description: 'Best balance of intelligence and speed',
    contextWindow: 200_000,
    capabilities: ['text-generation', 'structured-output', 'function-calling', 'vision'],
    costTier: 'medium',
    pricing: { inputPerMillion: 3, outputPerMillion: 15 },
  },
  [AI_MODEL_ID['anthropic/claude-haiku-4-5']]: {
    id: AI_MODEL_ID['anthropic/claude-haiku-4-5'],
    name: 'Claude Haiku 4.5',
    provider: AI_PROVIDER.anthropic,
    description: 'Fast and efficient for simple tasks',
    contextWindow: 200_000,
    capabilities: ['text-generation', 'fast-inference', 'vision'],
    costTier: 'low',
    pricing: { inputPerMillion: 1, outputPerMillion: 5 },
  },
  [AI_MODEL_ID['anthropic/claude-3-7-sonnet-latest']]: {
    id: AI_MODEL_ID['anthropic/claude-3-7-sonnet-latest'],
    name: 'Claude 3.7 Sonnet',
    provider: AI_PROVIDER.anthropic,
    description: 'Excellent for coding and analysis',
    contextWindow: 200_000,
    capabilities: ['text-generation', 'structured-output', 'function-calling'],
    costTier: 'medium',
    pricing: { inputPerMillion: 3, outputPerMillion: 15 },
  },
  [AI_MODEL_ID['anthropic/claude-3-5-haiku-latest']]: {
    id: AI_MODEL_ID['anthropic/claude-3-5-haiku-latest'],
    name: 'Claude 3.5 Haiku',
    provider: AI_PROVIDER.anthropic,
    description: 'Fast and cost-effective',
    contextWindow: 200_000,
    capabilities: ['text-generation', 'structured-output', 'fast-inference'],
    costTier: 'low',
    pricing: { inputPerMillion: 0.8, outputPerMillion: 4 },
  },
};
