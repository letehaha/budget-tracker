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
  [AI_FEATURE.statementParsing]: [
    // Gemini models - fast and cost-effective for text extraction
    AI_MODEL_ID['google/gemini-3-flash-preview'], // Latest, fast and capable
    AI_MODEL_ID['google/gemini-2.5-flash'], // Fast and good for document understanding
    AI_MODEL_ID['google/gemini-2.5-pro'], // Best Gemini quality for complex statements
    // Claude models - best for document understanding
    AI_MODEL_ID['anthropic/claude-sonnet-4-5'], // Latest and best for complex documents
    AI_MODEL_ID['anthropic/claude-3-7-sonnet-latest'], // Great balance of quality and cost
    AI_MODEL_ID['anthropic/claude-3-5-haiku-latest'], // Cheaper Claude option
    // GPT-4o has vision capabilities
    AI_MODEL_ID['openai/gpt-4o'], // Good vision capabilities for image-based extraction
    AI_MODEL_ID['openai/gpt-4o-mini'], // Cheaper option with decent vision
  ],
};

/**
 * Default models for each feature when no user config exists.
 * These are used as server fallback.
 */
export const FEATURE_DEFAULTS: Record<AI_FEATURE, AI_MODEL_ID> = {
  [AI_FEATURE.categorization]: AI_MODEL_ID['google/gemini-2.5-flash'],
  [AI_FEATURE.statementParsing]: AI_MODEL_ID['google/gemini-3-flash-preview'],
};
