import { AIModelInfo, AI_PROVIDER } from '@bt/shared/types';

import { AI_MODEL_ID } from '../model-ids';

export const ANTHROPIC_MODELS: Record<Extract<AI_MODEL_ID, `anthropic/${string}`>, AIModelInfo> = {
  [AI_MODEL_ID['anthropic/claude-opus-5']]: {
    id: AI_MODEL_ID['anthropic/claude-opus-5'],
    name: 'Claude Opus 5',
    provider: AI_PROVIDER.anthropic,
    description: 'Most capable Claude model for complex tasks',
    contextWindow: 1_000_000,
    capabilities: ['text-generation', 'structured-output', 'function-calling', 'vision', 'agents'],
    costTier: 'high',
    pricing: { inputPerMillion: 5, outputPerMillion: 25 },
  },
  [AI_MODEL_ID['anthropic/claude-sonnet-5']]: {
    id: AI_MODEL_ID['anthropic/claude-sonnet-5'],
    name: 'Claude Sonnet 5',
    provider: AI_PROVIDER.anthropic,
    description: 'Best balance of intelligence and speed',
    contextWindow: 1_000_000,
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
    capabilities: ['text-generation', 'structured-output', 'function-calling', 'vision', 'fast-inference'],
    costTier: 'low',
    pricing: { inputPerMillion: 1, outputPerMillion: 5 },
  },
};
