import { AI_FEATURE } from '@bt/shared/types';

import { AI_MODEL_ID } from './model-ids';

/**
 * Per-feature recommended models.
 * Models are listed in order of recommendation (first = most recommended).
 */
export const FEATURE_RECOMMENDATIONS: Record<AI_FEATURE, AI_MODEL_ID[]> = {
  [AI_FEATURE.categorization]: [
    AI_MODEL_ID['google/gemini-2.5-flash'], // Fast, cheap, great for bulk categorization
    AI_MODEL_ID['google/gemini-2.5-flash-lite'], // Ultra-lightweight, highest throughput
    AI_MODEL_ID['openai/gpt-4o-mini'], // Good balance of quality and cost
    AI_MODEL_ID['anthropic/claude-3-5-haiku-latest'], // Fast Claude option
    AI_MODEL_ID['groq/mixtral-8x7b-32768'], // Free/cheap option with good speed
  ],
};

/**
 * Default models for each feature when no user config exists.
 * These are used as server fallback.
 */
export const FEATURE_DEFAULTS: Record<AI_FEATURE, AI_MODEL_ID> = {
  [AI_FEATURE.categorization]: AI_MODEL_ID['google/gemini-2.5-flash'],
};
