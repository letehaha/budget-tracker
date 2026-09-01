import { AI_FEATURE } from '@bt/shared/types';

import { AI_MODEL_ID } from './model-ids';

/**
 * Shared recommendation list for document-extraction features (statement parsing,
 * investment transaction parsing). Both features extract structured data from the
 * same kind of image/text documents, so the same models rank the same way.
 */
const DOCUMENT_EXTRACTION_MODELS: AI_MODEL_ID[] = [
  // Gemini models - fast and cost-effective for text extraction
  AI_MODEL_ID['google/gemini-3.6-flash'], // Latest Flash, strong document understanding
  AI_MODEL_ID['google/gemini-3.1-pro-preview'], // Best Gemini quality for messy statements
  // Claude models - best for document understanding
  AI_MODEL_ID['anthropic/claude-haiku-4-5'], // Cheap Claude with vision
  AI_MODEL_ID['anthropic/claude-sonnet-5'], // Great balance of quality and cost
  // GPT-5.6 tiers all accept image input
  AI_MODEL_ID['openai/gpt-5.6-luna'], // Cheaper option with decent vision
  AI_MODEL_ID['openai/gpt-5.6-terra'], // Good vision capabilities for image-based extraction
  AI_MODEL_ID['openrouter/google/gemini-3.5-flash-lite'], // Long-context document extraction through OpenRouter
  AI_MODEL_ID['openrouter/anthropic/claude-haiku-4.5'], // Fast multimodal option through OpenRouter
];

/**
 * Per-feature recommended models.
 * Models are listed in order of recommendation (first = most recommended).
 */
export const FEATURE_RECOMMENDATIONS: Record<AI_FEATURE, AI_MODEL_ID[]> = {
  [AI_FEATURE.categorization]: [
    AI_MODEL_ID['google/gemma-4-31b-it'], // Free on the Gemini API, accurate enough for short merchant names
    AI_MODEL_ID['google/gemini-3.5-flash-lite'], // Cheapest Gemini with a free tier
    AI_MODEL_ID['groq/openai/gpt-oss-20b'], // Very cheap and the fastest option overall
    AI_MODEL_ID['openai/gpt-5.4-nano'], // Cheapest OpenAI tier
    AI_MODEL_ID['anthropic/claude-haiku-4-5'], // Fast Claude option
    AI_MODEL_ID['openrouter/openai/gpt-oss-20b'], // Low-cost categorization through OpenRouter
  ],
  [AI_FEATURE.statementParsing]: DOCUMENT_EXTRACTION_MODELS,
  [AI_FEATURE.investmentTransactionsParsing]: DOCUMENT_EXTRACTION_MODELS,
};

/**
 * Default models for each feature when no user config exists.
 * These are used as server fallback.
 */
export const FEATURE_DEFAULTS: Record<AI_FEATURE, AI_MODEL_ID> = {
  [AI_FEATURE.categorization]: AI_MODEL_ID['google/gemma-4-31b-it'],
  [AI_FEATURE.statementParsing]: AI_MODEL_ID['google/gemini-3.6-flash'],
  [AI_FEATURE.investmentTransactionsParsing]: AI_MODEL_ID['google/gemini-3.6-flash'],
};
